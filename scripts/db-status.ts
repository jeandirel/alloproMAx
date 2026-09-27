// Explicit, environment-aware replacement for bare `npx prisma migrate status`. That bare command
// only ever auto-loads ".env" (never ".env.local") and previously connected to a stale sandbox host
// without saying so — see docs/account-management.md §13. This resolves DATABASE_URL explicitly per
// target (see lib/target-env.ts), prints exactly which host/database it is about to use, then
// forces that value into the child process so Prisma's own ".env" autoload cannot silently win.
// Read-only — never runs migrate deploy/dev/reset or db push.
// Usage: npm run db:status:dev   (== tsx scripts/db-status.ts --env=development)
//        tsx scripts/db-status.ts --env=staging|production
import { spawnSync } from 'node:child_process'
import { resolveTargetEnv, parseEnvArg } from './lib/target-env'
import { parseDatabaseUrl } from './lib/db-url'

function main() {
  let env
  try {
    env = parseEnvArg(process.argv.slice(2))
  } catch (err) {
    console.error(`REFUSED: ${(err as Error).message}`)
    process.exitCode = 1
    return
  }

  let resolved
  try {
    resolved = resolveTargetEnv(env)
  } catch (err) {
    console.error(`REFUSED: ${(err as Error).message}`)
    process.exitCode = 1
    return
  }

  const parsed = parseDatabaseUrl(resolved.databaseUrl)
  console.log(`Environment: ${resolved.env}`)
  console.log(`Database host: ${parsed ? parsed.host : '(unparseable DATABASE_URL)'}`)
  console.log(`Database name: ${parsed ? parsed.database : '(unparseable DATABASE_URL)'}`)
  console.log(`DATABASE_URL source: ${resolved.source}`)
  console.log('---')

  const proc = spawnSync('npx', ['prisma', 'migrate', 'status'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: resolved.databaseUrl },
  })
  process.exitCode = proc.status ?? 0
}

main()
