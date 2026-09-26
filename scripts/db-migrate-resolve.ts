// Development-only wrapper for `prisma migrate resolve --applied <name>`. This updates the
// bookkeeping row in `_prisma_migrations` (recomputing the checksum from the current migration.sql
// file) WITHOUT executing any SQL against the database — used here because the real Development
// database's schema already reflects the repaired baseline (verified via db-inspect-address.ts /
// db-dump-ddl.ts), so re-running the CREATE TABLE statements for real would fail with
// "relation already exists". Usage: tsx scripts/db-migrate-resolve.ts <migration-name>
import { spawnSync } from 'node:child_process'
import { resolveTargetEnv } from './lib/target-env'

const name = process.argv[2]
if (!name) {
  console.error('Usage: tsx scripts/db-migrate-resolve.ts <migration-name>')
  process.exit(1)
}

const resolved = resolveTargetEnv('development')
const proc = spawnSync('npx', ['prisma', 'migrate', 'resolve', '--applied', name], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: resolved.databaseUrl },
})
process.exitCode = proc.status ?? 0
