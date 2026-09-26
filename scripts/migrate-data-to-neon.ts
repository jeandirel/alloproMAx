// Controlled data transfer from the old Development database to the new Neon Development database.
// Table order is derived automatically from the Prisma DMMF (parents before children, by scalar FK
// relations) so this never needs hand-maintained ordering as the schema grows.
//
// Never logs row content — only per-table counts, before and after. Never logs a connection string.
//
// Usage:
//   tsx scripts/migrate-data-to-neon.ts --dry-run   (default; counts + connectivity only, no writes)
//   tsx scripts/migrate-data-to-neon.ts --execute    (actually copies rows, table by table, each
//                                                      table's insert wrapped in one transaction)
//
// Source: resolveTargetEnv('development') (the existing .env.local-backed old DB), unless
//         SOURCE_DATABASE_URL is exported explicitly.
// Target: TARGET_DATABASE_URL must be exported explicitly — never guessed, never read from a file,
//         consistent with scripts/lib/target-env.ts's "no silent fallback across environments" rule.
import { resolveTargetEnv } from './lib/target-env'

const EXECUTE = process.argv.includes('--execute')

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL ?? resolveTargetEnv('development').databaseUrl
  const targetUrl = process.env.TARGET_DATABASE_URL
  if (!targetUrl) {
    console.error(
      'TARGET_DATABASE_URL is not set. Export it explicitly (e.g. the Neon Development DIRECT_URL) ' +
        '— this script never guesses or reads it from a file.',
    )
    process.exit(1)
  }

  const { PrismaClient, Prisma } = await import('@prisma/client')
  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } })
  const target = new PrismaClient({ datasources: { db: { url: targetUrl } } })

  console.log(`Mode: ${EXECUTE ? 'EXECUTE (will write to target)' : 'DRY RUN (counts + validation only)'}`)

  await source.$connect()
  await target.$connect()
  console.log('Source: connected. Target: connected.\n')

  const order = topologicalModelOrder(Prisma.dmmf.datamodel.models)
  console.log(`Table order (${order.length} models, parents before children):\n  ${order.join(', ')}\n`)

  const beforeCounts: Record<string, number> = {}
  const afterCounts: Record<string, number> = {}

  const modelsByName = new Map(Prisma.dmmf.datamodel.models.map((m: any) => [m.name, m]))

  for (const modelName of order) {
    const prop = clientPropertyName(modelName)
    let sourceCount: number
    try {
      sourceCount = await (source as any)[prop].count()
    } catch (e) {
      if ((e as { code?: string }).code === 'P2021') {
        console.log(`${modelName.padEnd(24)} source table does not exist yet — skip (nothing to transfer)`)
        continue
      }
      throw e
    }
    beforeCounts[modelName] = sourceCount

    if (sourceCount === 0) {
      console.log(`${modelName.padEnd(24)} source=0            skip`)
      afterCounts[modelName] = await (target as any)[prop].count()
      continue
    }

    if (!EXECUTE) {
      const targetCount = await (target as any)[prop].count()
      console.log(`${modelName.padEnd(24)} source=${String(sourceCount).padEnd(6)} target(before)=${targetCount}`)
      continue
    }

    // The source table can be schema-behind (e.g. a pending migration not yet applied there) —
    // restrict the select to columns that actually exist on the source table, so a Prisma model
    // field newer than the source schema doesn't blow up findMany() with P2022. Omitted columns on
    // the target get their DEFAULT (safe by this project's additive-only migration convention).
    const existingColumns = await sourceTableColumns(source, modelName)
    const model = modelsByName.get(modelName)
    const select: Record<string, true> = {}
    for (const f of model.fields) {
      if ((f.kind === 'scalar' || f.kind === 'enum') && existingColumns.has(f.name)) {
        select[f.name] = true
      }
    }

    const rows = await (source as any)[prop].findMany({ select })
    await target.$transaction(async (tx: any) => {
      await tx[prop].createMany({ data: rows, skipDuplicates: true })
    })
    afterCounts[modelName] = await (target as any)[prop].count()
    console.log(`${modelName.padEnd(24)} source=${String(sourceCount).padEnd(6)} target(after)=${afterCounts[modelName]}`)
  }

  if (EXECUTE) {
    console.log('\nValidation (source count vs. target count after transfer):')
    let mismatch = false
    for (const modelName of order) {
      if (!(modelName in beforeCounts)) continue // source table didn't exist — nothing to validate
      const s = beforeCounts[modelName]
      const a = afterCounts[modelName] ?? 0
      const ok = a >= s
      if (!ok) mismatch = true
      console.log(`  ${modelName.padEnd(24)} source=${s}  target=${a}  ${ok ? 'OK' : 'MISMATCH'}`)
    }
    if (mismatch) {
      console.error('\nOne or more tables did not reach at least the source row count. Investigate before relying on this transfer.')
      process.exitCode = 1
    } else {
      console.log('\nAll tables reached at least the source row count.')
    }
  } else {
    console.log('\nDry run complete — no data written. Re-run with --execute to actually transfer.')
  }

  await source.$disconnect()
  await target.$disconnect()
}

function clientPropertyName(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1)
}

// Table name == model name, column name == field name throughout this schema (no @@map/@map used
// anywhere — confirmed against prisma/schema.prisma before writing this script).
async function sourceTableColumns(source: any, tableName: string): Promise<Set<string>> {
  const rows = await source.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `
  return new Set(rows.map((r: { column_name: string }) => r.column_name))
}

// Parents (models with no outgoing required scalar-FK dependency, or whose dependencies are already
// placed) come first, so createMany() never hits a foreign key violation.
function topologicalModelOrder(models: readonly { name: string; fields: readonly any[] }[]): string[] {
  const names = models.map((m) => m.name)
  const deps = new Map<string, Set<string>>()
  for (const m of models) {
    const modelDeps = new Set<string>()
    for (const f of m.fields) {
      if (f.kind === 'object' && Array.isArray(f.relationFromFields) && f.relationFromFields.length > 0) {
        if (f.type !== m.name && names.includes(f.type)) {
          modelDeps.add(f.type)
        }
      }
    }
    deps.set(m.name, modelDeps)
  }

  const ordered: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(name: string) {
    if (visited.has(name)) return
    if (visiting.has(name)) return // cycle guard: leave to a later pass, avoid infinite recursion
    visiting.add(name)
    for (const dep of deps.get(name) ?? []) {
      visit(dep)
    }
    visiting.delete(name)
    visited.add(name)
    ordered.push(name)
  }

  for (const name of names) visit(name)
  return ordered
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
