// Human-facing gate in front of `prisma migrate deploy`. READ-ONLY — never applies the migration
// itself. Run with: npm run account:predeploy
//
// This exists so a developer sees every relevant check in one screen before they type
// `npx prisma migrate deploy` themselves — it does not, and must not, run that command for them.
import dns from 'node:dns/promises'
import net from 'node:net'
import { spawnSync } from 'node:child_process'
import { loadAppEnv } from './lib/load-app-env'
import { parseDatabaseUrl, classifyIp } from './lib/db-url'

// Must run before @prisma/client is ever imported — see the warning in lib/load-app-env.ts.
loadAppEnv()

function testTcp(host: string, port: number, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    socket.setTimeout(timeoutMs)
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.on('connect', () => finish(true))
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
    socket.connect(port, host)
  })
}

function line(label: string, value: string) {
  console.log(`${label.padEnd(24)}: ${value}`)
}

async function main() {
  console.log('ACCOUNT MANAGEMENT PREDEPLOY')
  console.log('--------------------------------')

  const raw = process.env.DATABASE_URL
  const parsed = raw ? parseDatabaseUrl(raw) : null
  let dbOk = false
  let pgOk = false
  let dupOk: boolean | null = null
  let emptyOk: boolean | null = null
  let pendingCount = 0

  if (!raw || !parsed) {
    line('Database connectivity', 'FAIL (DATABASE_URL missing or invalid)')
  } else {
    let ip: string | null = null
    try {
      ip = (await dns.resolve4(parsed.host).catch(async () => [(await dns.lookup(parsed.host, { family: 4 })).address]))[0]
    } catch {
      /* handled by dbOk staying false */
    }
    const tcp = ip ? await testTcp(parsed.host, Number(parsed.port)) : false
    dbOk = tcp
    line('Database connectivity', tcp ? `PASS (${ip}, ${ip ? classifyIp(ip) : 'UNKNOWN'})` : 'FAIL (TCP unreachable)')

    if (tcp) {
      const { PrismaClient } = await import('@prisma/client')
      const prisma = new PrismaClient({ datasources: { db: { url: raw } } })
      try {
        await prisma.$queryRawUnsafe('SELECT 1')
        pgOk = true
        line('PostgreSQL', 'PASS')

        const dup = await prisma.$queryRawUnsafe<{ groups: bigint }[]>(
          `SELECT COUNT(*)::bigint AS groups FROM (
             SELECT phone FROM "User" WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*) > 1
           ) t`
        )
        dupOk = Number(dup[0].groups) === 0
        line('Phone duplicates', dupOk ? 'PASS' : `FAIL (${dup[0].groups} group(s))`)

        const empty = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "User" WHERE phone = ''`)
        emptyOk = Number(empty[0].count) === 0
        line('Empty phones', emptyOk ? 'PASS' : `FAIL (${empty[0].count} row(s))`)
      } catch (err) {
        line('PostgreSQL', `FAIL (${(err as Error).message.split('\n')[0]})`)
      } finally {
        await prisma.$disconnect()
      }
    } else {
      line('PostgreSQL', 'SKIP (no TCP)')
      line('Phone duplicates', 'SKIP')
      line('Empty phones', 'SKIP')
    }
  }

  line('Backup confirmed', 'MANUAL CHECK')

  if (dbOk && pgOk) {
    const proc = spawnSync('npx', ['prisma', 'migrate', 'status'], { encoding: 'utf8', env: process.env, shell: true })
    const output = `${proc.stdout || ''}${proc.stderr || ''}`
    const pendingMatch = output.match(/Following migration have not yet been applied:\n([\s\S]*?)\n\n/)
    pendingCount = pendingMatch ? pendingMatch[1].trim().split('\n').filter(Boolean).length : 0
  }
  line('Migration pending', pendingCount > 0 ? 'YES' : dbOk && pgOk ? 'NO' : 'UNKNOWN')
  line('Integration environment', 'UNVERIFIED — confirm in the hosting dashboard before deploying to Production')

  console.log('--------------------------------')
  const safe = dbOk && pgOk && dupOk === true && emptyOk === true
  console.log(`SAFE TO MIGRATE        : ${safe ? 'YES' : 'NO'}`)
  console.log('This script never runs `prisma migrate deploy`. Run it yourself once you have')
  console.log('confirmed a backup/rollback path and which environment DATABASE_URL points at.')

  if (!safe) process.exitCode = 1
}

main()
