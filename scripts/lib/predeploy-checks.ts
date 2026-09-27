// Shared read-only check runner used by db-predeploy.ts and db-migrate-dev.ts. Never writes to the
// database, never runs `prisma migrate deploy/dev/reset` or `db push` itself — callers decide what
// to do with the result. Dynamically imports @prisma/client (see lib/load-app-env.ts for why a
// static top-level import would be wrong here).
import net from 'node:net'
import dns from 'node:dns/promises'
import { spawnSync } from 'node:child_process'
import { classifyIp } from './db-url'

export interface PredeployCheckResult {
  ip: string | null
  ipCategory: 'PRIVATE_IP' | 'PUBLIC_IP' | 'UNKNOWN' | null
  tcpOk: boolean
  pgOk: boolean
  pgError: string | null
  dupOk: boolean | null
  dupGroups: number | null
  emptyOk: boolean | null
  emptyCount: number | null
  pendingCount: number
  pendingMigrations: string[]
}

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

export async function runReadOnlyChecks(databaseUrl: string, host: string, port: number): Promise<PredeployCheckResult> {
  const result: PredeployCheckResult = {
    ip: null,
    ipCategory: null,
    tcpOk: false,
    pgOk: false,
    pgError: null,
    dupOk: null,
    dupGroups: null,
    emptyOk: null,
    emptyCount: null,
    pendingCount: 0,
    pendingMigrations: [],
  }

  try {
    const addrs = await dns.resolve4(host).catch(async () => [(await dns.lookup(host, { family: 4 })).address])
    result.ip = addrs[0] ?? null
    result.ipCategory = result.ip ? classifyIp(result.ip) : 'UNKNOWN'
  } catch {
    /* result.ip stays null */
  }

  result.tcpOk = result.ip ? await testTcp(host, port) : false
  if (!result.tcpOk) return result

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    await prisma.$queryRawUnsafe('SELECT 1')
    result.pgOk = true

    const dup = await prisma.$queryRawUnsafe<{ groups: bigint }[]>(
      `SELECT COUNT(*)::bigint AS groups FROM (
         SELECT phone FROM "User" WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*) > 1
       ) t`,
    )
    result.dupGroups = Number(dup[0].groups)
    result.dupOk = result.dupGroups === 0

    const empty = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "User" WHERE phone = ''`)
    result.emptyCount = Number(empty[0].count)
    result.emptyOk = result.emptyCount === 0
  } catch (err) {
    result.pgError = (err as Error).message.split('\n')[0]
  } finally {
    await prisma.$disconnect()
  }

  const proc = spawnSync('npx', ['prisma', 'migrate', 'status'], {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
  const output = `${proc.stdout || ''}${proc.stderr || ''}`
  const pendingMatch = output.match(/Following migration have not yet been applied:\n([\s\S]*?)\n\n/)
  result.pendingMigrations = pendingMatch ? pendingMatch[1].trim().split('\n').filter(Boolean) : []
  result.pendingCount = result.pendingMigrations.length

  return result
}
