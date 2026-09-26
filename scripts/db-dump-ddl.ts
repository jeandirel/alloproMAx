// One-off, read-only DDL dumper for Address/Professional as they currently exist on Development.
// Used to reconstruct an accurate CREATE TABLE statement for the migration-history repair.
import { resolveTargetEnv } from './lib/target-env'

const TABLES = ['Address', 'Professional']

async function main() {
  const resolved = resolveTargetEnv('development')
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: resolved.databaseUrl } } })
  try {
    for (const table of TABLES) {
      console.log(`\n===== ${table} =====`)
      const cols = await prisma.$queryRawUnsafe<any[]>(
        `SELECT column_name, data_type, udt_name, character_maximum_length, is_nullable, column_default
         FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        table,
      )
      console.log('COLUMNS:')
      for (const c of cols) console.log(JSON.stringify(c))

      const pk = await prisma.$queryRawUnsafe<any[]>(
        `SELECT tc.constraint_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
         WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'`,
        table,
      )
      console.log('PRIMARY KEY:', JSON.stringify(pk))

      const indexes = await prisma.$queryRawUnsafe<any[]>(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1`,
        table,
      )
      console.log('INDEXES:')
      for (const i of indexes) console.log(JSON.stringify(i))

      const fks = await prisma.$queryRawUnsafe<any[]>(
        `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'f'`,
        `"${table}"`,
      )
      console.log('FOREIGN KEYS:')
      for (const f of fks) console.log(JSON.stringify(f))
    }
  } finally {
    await prisma.$disconnect()
  }
}

main()
