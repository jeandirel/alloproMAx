// One-off, read-only inspector for the Address/_prisma_migrations forensic investigation.
// Never writes to the database. Development-only (hardcoded, no --env flag).
import { resolveTargetEnv } from './lib/target-env'

async function main() {
  const resolved = resolveTargetEnv('development')
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: resolved.databaseUrl } } })
  try {
    const addr = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT to_regclass('"Address"') IS NOT NULL AS exists`,
    )
    console.log(`Address table exists: ${addr[0].exists ? 'YES' : 'NO'}`)

    if (addr[0].exists) {
      const cols = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string; is_nullable: string }[]>(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'Address' ORDER BY ordinal_position`,
      )
      console.log('Address columns:')
      for (const c of cols) console.log(`  ${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`)
    }

    const migTableExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS exists`,
    )
    console.log(`_prisma_migrations table exists: ${migTableExists[0].exists ? 'YES' : 'NO'}`)

    if (migTableExists[0].exists) {
      const rows = await prisma.$queryRawUnsafe<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>(
        `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC`,
      )
      console.log('_prisma_migrations rows:')
      for (const r of rows) {
        const status = r.rolled_back_at ? 'ROLLED_BACK' : r.finished_at ? 'APPLIED' : 'PENDING/FAILED'
        console.log(`  ${r.migration_name} -> ${status} (finished_at present: ${r.finished_at ? 'yes' : 'no'})`)
      }
    }

    const profExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT to_regclass('"Professional"') IS NOT NULL AS exists`,
    )
    console.log(`Professional table exists: ${profExists[0].exists ? 'YES' : 'NO'}`)
  } finally {
    await prisma.$disconnect()
  }
}

main()
