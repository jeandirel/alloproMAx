// Read-only: generates the SQL required to build the ENTIRE current Development schema from an
// empty database, using Prisma's own diff engine (`prisma migrate diff --from-empty`). This does
// NOT touch the real database — `--to-schema-datasource` only reads the datasource's connection
// string via env, the same way `prisma db pull`/introspection would, to compute a diff.
// Output is written to a scratch file for review, never applied automatically.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolveTargetEnv } from './lib/target-env'

function main() {
  const resolved = resolveTargetEnv('development')
  const proc = spawnSync(
    'npx',
    ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datasource', 'prisma/schema.prisma', '--script'],
    {
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, DATABASE_URL: resolved.databaseUrl },
      maxBuffer: 1024 * 1024 * 50,
    },
  )
  if (proc.status !== 0) {
    console.error('prisma migrate diff failed:')
    console.error(proc.stderr)
    process.exitCode = 1
    return
  }
  fs.writeFileSync('scripts/.baseline-generated.sql', proc.stdout, 'utf8')
  console.log(`Wrote ${proc.stdout.length} bytes to scripts/.baseline-generated.sql`)
}

main()
