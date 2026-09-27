// Explicit `prisma migrate dev` wrapper — development ONLY, hardcoded, no --env flag accepted.
// Runs the same read-only preflight as db-predeploy.ts first and refuses to proceed if it fails.
// Prisma's own interactive prompts (e.g. drift detection asking to reset) are left fully intact via
// stdio: 'inherit' — this never auto-answers them. Never usable against staging or production: there
// is no flag, env var, or code path in this file that resolves any target other than 'development'.
// Usage: npm run db:migrate:dev
import { spawnSync } from 'node:child_process'
import { resolveTargetEnv } from './lib/target-env'
import { parseDatabaseUrl } from './lib/db-url'
import { runReadOnlyChecks } from './lib/predeploy-checks'

function line(label: string, value: string) {
  console.log(`${label.padEnd(24)}: ${value}`)
}

async function main() {
  const resolved = resolveTargetEnv('development')
  const parsed = parseDatabaseUrl(resolved.databaseUrl)
  if (!parsed) {
    console.error('REFUSED: DATABASE_URL is not a valid postgres:// URL.')
    process.exitCode = 1
    return
  }

  console.log('Environment: development')
  line('Database host', parsed.host)
  line('Database name', parsed.database)
  line('DATABASE_URL source', resolved.source)

  const checks = await runReadOnlyChecks(resolved.databaseUrl, parsed.host, Number(parsed.port))
  line('Migration pending', checks.pgOk ? String(checks.pendingCount) : 'UNKNOWN')
  const preflightPass = checks.tcpOk && checks.pgOk && checks.dupOk === true && checks.emptyOk === true
  line('Preflight', preflightPass ? 'PASS' : 'FAIL')
  console.log('---')

  if (!preflightPass) {
    console.error('REFUSED: preflight did not pass — not running `prisma migrate dev`. See failures above.')
    process.exitCode = 1
    return
  }

  console.log('Running `prisma migrate dev` against the development database above...')
  const proc = spawnSync('npx', ['prisma', 'migrate', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: resolved.databaseUrl },
  })
  process.exitCode = proc.status ?? 0
}

main()
