// Generalized, environment-explicit predeploy gate. Prints the banner required before anyone
// applies the account-lifecycle migration by hand, then the same read-only checks as
// account-management-predeploy.ts (kept separate on purpose — that script stays a fixed,
// development-only alias; this one is the multi-target entry point named in docs/account-management
// .md §13).
//
// PRODUCTION SAFETY: this file contains no code path that invokes `prisma migrate deploy`, `migrate
// reset`, or `db push` — not behind a flag, not behind an env var, not at all. For --env=production
// it only ever prints the same read-only checks and then stops; it never prints "SAFE TO MIGRATE".
//
// Usage: npm run db:predeploy                  (== --env=development)
//        tsx scripts/db-predeploy.ts --env=production   (requires PRODUCTION_DATABASE_URL, read-only)
import { resolveTargetEnv, parseEnvArg } from './lib/target-env'
import { parseDatabaseUrl } from './lib/db-url'
import { runReadOnlyChecks } from './lib/predeploy-checks'

function line(label: string, value: string) {
  console.log(`${label.padEnd(24)}: ${value}`)
}

async function main() {
  let env
  try {
    env = parseEnvArg(process.argv.slice(2))
  } catch (err) {
    console.error(`REFUSED: ${(err as Error).message}`)
    process.exitCode = 1
    return
  }

  console.log(`ACCOUNT MANAGEMENT PREDEPLOY — target: ${env}`)
  console.log('--------------------------------')

  let resolved
  try {
    resolved = resolveTargetEnv(env)
  } catch (err) {
    line('Database connectivity', `REFUSED (${(err as Error).message})`)
    console.log('--------------------------------')
    console.log('SAFE TO MIGRATE        : NO')
    process.exitCode = 1
    return
  }

  const parsed = parseDatabaseUrl(resolved.databaseUrl)
  if (!parsed) {
    line('Database connectivity', 'FAIL (DATABASE_URL is not a valid postgres:// URL)')
    console.log('--------------------------------')
    console.log('SAFE TO MIGRATE        : NO')
    process.exitCode = 1
    return
  }

  line('Environment', resolved.env)
  line('DATABASE_URL source', resolved.source)
  line('Database host', parsed.host)
  line('Database name', parsed.database)

  const checks = await runReadOnlyChecks(resolved.databaseUrl, parsed.host, Number(parsed.port))

  line('Database connectivity', checks.tcpOk ? `PASS (${checks.ip}, ${checks.ipCategory})` : 'FAIL (TCP unreachable)')
  line('PostgreSQL', checks.pgOk ? 'PASS' : checks.tcpOk ? `FAIL (${checks.pgError})` : 'SKIP (no TCP)')
  line('Phone duplicates', checks.dupOk === null ? 'SKIP' : checks.dupOk ? 'PASS' : `FAIL (${checks.dupGroups} group(s))`)
  line('Empty phones', checks.emptyOk === null ? 'SKIP' : checks.emptyOk ? 'PASS' : `FAIL (${checks.emptyCount} row(s))`)
  line('Migration pending', checks.pgOk ? (checks.pendingCount > 0 ? `YES (${checks.pendingCount})` : 'NO') : 'UNKNOWN')
  line('Backup confirmed', 'MANUAL CHECK')

  if (env === 'production') {
    console.log('--------------------------------')
    console.log('PRODUCTION: only the read-only checks above are ever run against this database.')
    console.log('This script has no code path that runs `prisma migrate deploy`, `migrate reset`, or')
    console.log('`db push` — apply the migration yourself, manually, only after verifying this host in')
    console.log('the Vercel dashboard and confirming a backup/PITR point exists.')
    return
  }

  console.log('--------------------------------')
  const safe = checks.tcpOk && checks.pgOk && checks.dupOk === true && checks.emptyOk === true
  console.log(`SAFE TO MIGRATE        : ${safe ? 'YES' : 'NO'}`)
  console.log('This script never runs `prisma migrate deploy`. Run it yourself once you have')
  console.log('confirmed a backup/rollback path and which environment DATABASE_URL points at.')
  if (!safe) process.exitCode = 1
}

main()
