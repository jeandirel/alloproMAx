// End-to-end DB connectivity check: DATABASE_URL -> DNS -> TCP -> real Postgres round trip.
// Read-only (SELECT only). Never prints the connection string or password. Run with:
// npm run db:check
import dns from 'node:dns/promises'
import net from 'node:net'
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

async function main() {
  const raw = process.env.DATABASE_URL
  if (!raw) {
    console.log('DATABASE_URL: NOT_CONFIGURED')
    process.exitCode = 1
    return
  }
  console.log('DATABASE_URL: configured')

  const parsed = parseDatabaseUrl(raw)
  if (!parsed) {
    console.log('DATABASE_URL: INVALID')
    process.exitCode = 1
    return
  }

  let ip: string | null = null
  try {
    const ips = await dns.resolve4(parsed.host).catch(async () => [(await dns.lookup(parsed.host, { family: 4 })).address])
    ip = ips[0] ?? null
  } catch {
    console.log('DNS: FAIL')
    process.exitCode = 1
    return
  }
  const category = ip ? classifyIp(ip) : 'UNKNOWN'
  console.log(`DNS: ${category}`)

  const port = Number(parsed.port)
  const tcpStart = Date.now()
  const tcpOk = await testTcp(parsed.host, port)
  if (!tcpOk) {
    console.log('TCP: FAIL')
    console.log('POSTGRES: NOT_REACHABLE')
    process.exitCode = 1
    return
  }
  console.log(`TCP: PASS (${Date.now() - tcpStart}ms)`)

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: raw } } })
  try {
    const pgStart = Date.now()
    const rows = await prisma.$queryRawUnsafe<{ db: string; usr: string; ver: string }[]>(
      'SELECT current_database() AS db, current_user AS usr, version() AS ver'
    )
    const latency = Date.now() - pgStart
    console.log('POSTGRES: PASS')
    console.log(`DATABASE: ${rows[0]?.db}`)
    console.log(`USER: ${rows[0]?.usr}`)
    console.log(`VERSION: ${rows[0]?.ver?.split(',')[0]}`)
    console.log(`LATENCY: ${latency}ms`)
  } catch (err) {
    console.log('POSTGRES: FAIL')
    console.log(`ERROR: ${(err as Error).message.split('\n')[0]}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main()
