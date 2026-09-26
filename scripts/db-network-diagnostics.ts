// Pure network diagnostics for DATABASE_URL — no Postgres protocol involved, so this still gives
// a useful answer even when the DB itself is down. Run with: npx tsx scripts/db-network-diagnostics.ts
import dns from 'node:dns/promises'
import net from 'node:net'
import { loadAppEnv } from './lib/load-app-env'
import { parseDatabaseUrl, classifyIp } from './lib/db-url'

loadAppEnv()

function testTcp(host: string, port: number, timeoutMs = 5000): Promise<{ ok: boolean; ms: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = new net.Socket()
    let settled = false
    socket.setTimeout(timeoutMs)
    const finish = (ok: boolean, error?: string) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ok, ms: Date.now() - start, error })
    }
    socket.on('connect', () => finish(true))
    socket.on('timeout', () => finish(false, 'TIMEOUT'))
    socket.on('error', (err: NodeJS.ErrnoException) => finish(false, err.code || err.message))
    socket.connect(port, host)
  })
}

async function main() {
  const raw = process.env.DATABASE_URL
  console.log('=== DB Network Diagnostics ===')
  if (!raw) {
    console.log('DATABASE_URL: NOT_CONFIGURED')
    process.exitCode = 1
    return
  }
  const parsed = parseDatabaseUrl(raw)
  if (!parsed) {
    console.log('DATABASE_URL: configured (INVALID — not a parseable postgres:// URL)')
    process.exitCode = 1
    return
  }

  console.log(`hostname: ${parsed.host}`)
  console.log(`port: ${parsed.port}`)
  console.log(`database: ${parsed.database}`)

  let resolvedIps: string[] = []
  try {
    resolvedIps = await dns.resolve4(parsed.host)
  } catch {
    try {
      // Some hosts (or /etc/hosts overrides) only have an A record via the OS resolver, not
      // Node's own DNS client — lookup() falls back to that path.
      const { address } = await dns.lookup(parsed.host, { family: 4 })
      resolvedIps = [address]
    } catch (err2) {
      console.log(`DNS: FAIL (${(err2 as Error).message})`)
      process.exitCode = 1
      return
    }
  }

  for (const ip of resolvedIps) {
    const category = classifyIp(ip)
    console.log(`resolved IP: ${ip}`)
    console.log(`IP category: ${category}`)
  }

  const port = Number(parsed.port)
  const tcp = await testTcp(parsed.host, port)
  console.log(`TCP (${parsed.host}:${port}): ${tcp.ok ? `PASS (${tcp.ms}ms)` : `FAIL (${tcp.error}, after ${tcp.ms}ms)`}`)

  if (!tcp.ok && resolvedIps.some((ip) => classifyIp(ip) === 'PRIVATE_IP')) {
    console.log('')
    console.log('DIAGNOSIS: hostname resolves to a private (RFC1918) address that this machine')
    console.log('cannot route to. This is expected for a database meant to be reached only from')
    console.log('inside its own hosting network (e.g. a hosted dev sandbox) — it is not a')
    console.log('firewall misconfiguration to "fix" by exposing the DB publicly. See')
    console.log('docs/account-management.md §Local vs private network for the supported path.')
  }
}

main()
