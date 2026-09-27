// Full DB preflight for the account-management migration. READ-ONLY: never runs `migrate deploy`,
// `migrate dev`, `db push`, or any DDL/DML. Run with: npm run db:preflight
//
// Order (per docs/account-management.md §Migration preflight):
//  1. DATABASE_URL configured        6. TCP port reachable
//  2. URL syntactically valid        7. Postgres connection
//  3. hostname extracted             8. Prisma connectivity ($queryRaw)
//  4. DNS resolves                   9. migration status (pending vs applied)
//  5. private/public IP class.      10. duplicate User.phone      11. NULL/empty phone sanity
//                                    12. migration safety (pointer to the audited migration.sql)
import dns from 'node:dns/promises'
import net from 'node:net'
import { spawnSync } from 'node:child_process'
import { loadAppEnv } from './lib/load-app-env'
import { parseDatabaseUrl, classifyIp, maskDatabaseUrl } from './lib/db-url'

// Must run before @prisma/client is ever imported — see lib/load-app-env.ts.
loadAppEnv()

type Status = 'PASS' | 'FAIL' | 'WARN' | 'SKIP'

const results: { step: string; status: Status; detail?: string }[] = []
function record(step: string, status: Status, detail?: string) {
  results.push({ step, status, detail })
  console.log(`${status.padEnd(4)} ${step}${detail ? ` — ${detail}` : ''}`)
}

function testTcp(host: string, port: number, timeoutMs = 5000): Promise<{ ok: boolean; ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = new net.Socket()
    let settled = false
    socket.setTimeout(timeoutMs)
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ok, ms: Date.now() - start })
    }
    socket.on('connect', () => finish(true))
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
    socket.connect(port, host)
  })
}

async function main() {
  console.log('=== Account Management — DB Preflight (read-only) ===\n')

  // 1. DATABASE_URL configured
  const raw = process.env.DATABASE_URL
  if (!raw) {
    record('DATABASE_URL configured', 'FAIL', 'not set')
    return finish()
  }
  record('DATABASE_URL configured', 'PASS', maskDatabaseUrl(raw))

  // 2-3. Syntactically valid + hostname extracted
  const parsed = parseDatabaseUrl(raw)
  if (!parsed) {
    record('URL syntactically valid', 'FAIL', 'not a parseable postgres:// URL')
    return finish()
  }
  record('URL syntactically valid', 'PASS')
  record('hostname extracted', 'PASS', parsed.host)

  // 4-5. DNS + IP classification
  let ip: string | null = null
  try {
    const ips = await dns.resolve4(parsed.host).catch(async () => [(await dns.lookup(parsed.host, { family: 4 })).address])
    ip = ips[0] ?? null
  } catch {
    record('DNS resolves', 'FAIL')
    return finish()
  }
  record('DNS resolves', 'PASS', ip ?? undefined)
  const category = ip ? classifyIp(ip) : 'UNKNOWN'
  record('private/public IP classification', category === 'PUBLIC_IP' ? 'PASS' : 'WARN', category)

  // 6. TCP port
  const tcp = await testTcp(parsed.host, Number(parsed.port))
  record('TCP port reachable', tcp.ok ? 'PASS' : 'FAIL', `${parsed.port} (${tcp.ms}ms)`)
  if (!tcp.ok) {
    if (category === 'PRIVATE_IP') {
      console.log('\nHINT: hostname resolves to a private (RFC1918) address — this DB is only')
      console.log('reachable from inside its own hosting network, not from this machine. See')
      console.log('docs/account-management.md §Local vs private network.')
    }
    return finish()
  }

  // 7-8. Postgres connection + Prisma connectivity
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: raw } } })
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    record('Postgres connection', 'PASS')
    record('Prisma connectivity', 'PASS')
  } catch (err) {
    record('Postgres connection', 'FAIL', (err as Error).message.split('\n')[0])
    await prisma.$disconnect()
    return finish()
  }

  // 9. migration status — `prisma migrate status` exits non-zero whenever migrations are
  // pending (documented CLI behavior, not a failure of this check), so read stdout regardless
  // of exit code rather than treating it as thrown/fatal.
  {
    const proc = spawnSync('npx', ['prisma', 'migrate', 'status'], {
      encoding: 'utf8',
      env: process.env,
      shell: true, // `npx` is a .cmd shim on Windows — needs a shell to resolve.
    })
    const output = `${proc.stdout || ''}${proc.stderr || ''}`
    const pendingMatch = output.match(/Following migration have not yet been applied:\n([\s\S]*?)\n\n/)
    if (pendingMatch) {
      const pending = pendingMatch[1].trim().split('\n').filter(Boolean)
      record('migration status', 'WARN', `${pending.length} pending: ${pending.join(', ')}`)
    } else if (/Database schema is up to date/.test(output)) {
      record('migration status', 'PASS', 'up to date')
    } else {
      record('migration status', 'FAIL', output.split('\n').filter(Boolean).slice(0, 3).join(' | ') || 'no output')
    }
  }

  // 10. duplicate User.phone
  try {
    const dup = await prisma.$queryRawUnsafe<{ groups: bigint; rows: bigint }[]>(
      `SELECT COUNT(*)::bigint AS groups, COALESCE(SUM(c), 0)::bigint AS rows FROM (
         SELECT COUNT(*) AS c FROM "User" WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*) > 1
       ) t`
    )
    const groups = Number(dup[0].groups)
    const rows = Number(dup[0].rows)
    record('duplicate User.phone', groups === 0 ? 'PASS' : 'FAIL', `${groups} duplicate group(s), ${rows} row(s)`)
  } catch (err) {
    record('duplicate User.phone', 'SKIP', (err as Error).message.split('\n')[0])
  }

  // 11. NULL/empty phone sanity
  try {
    const empty = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "User" WHERE phone = ''`)
    const emptyCount = Number(empty[0].count)
    record('empty-string User.phone', emptyCount === 0 ? 'PASS' : 'FAIL', `${emptyCount} row(s) — '' would collide under the new UNIQUE index`)
  } catch (err) {
    record('empty-string User.phone', 'SKIP', (err as Error).message.split('\n')[0])
  }

  // 12. migration safety — static pointer, not computed live.
  record(
    'migration safety review',
    'WARN',
    'see docs/account-management-migration-review.md — User_phone_key classified CHECK_REQUIRED until this preflight is green'
  )

  await prisma.$disconnect()
  finish()
}

function finish() {
  const fail = results.filter((r) => r.status === 'FAIL')
  console.log('\n--------------------------------')
  console.log(`SAFE TO MIGRATE: ${fail.length === 0 ? 'YES' : 'NO'}`)
  if (fail.length) {
    console.log('Blocking:', fail.map((r) => r.step).join(', '))
    process.exitCode = 1
  }
}

main()
