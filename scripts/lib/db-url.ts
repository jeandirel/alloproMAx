// Small, dependency-free helpers shared by the DB diagnostic scripts. Kept separate from
// lib/prisma.ts on purpose: these must work BEFORE we know the connection is healthy, and must
// never construct a PrismaClient/NextAuth instance at import time (see scripts/account-management
// .test.ts's comment on why — importing auth.ts or lib/prisma.ts eagerly opens a connection).

export interface ParsedDbUrl {
  host: string
  port: string
  database: string
  user: string
}

export function parseDatabaseUrl(raw: string): ParsedDbUrl | null {
  try {
    const url = new URL(raw)
    if (!url.protocol.startsWith('postgres')) return null
    return {
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.replace(/^\//, ''),
      user: decodeURIComponent(url.username || ''),
    }
  } catch {
    return null
  }
}

// Masks credentials for safe logging: postgresql://USER:********@HOST:PORT/DATABASE
export function maskDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw)
    const user = url.username ? decodeURIComponent(url.username) : ''
    return `${url.protocol}//${user}:********@${url.host}${url.pathname}`
  } catch {
    return '(unparseable connection string — not shown)'
  }
}

export type IpCategory = 'PRIVATE_IP' | 'PUBLIC_IP' | 'UNKNOWN'

// RFC 1918 (IPv4 private ranges) + loopback + link-local — anything in these ranges is only
// reachable from inside the network that issued it, never from an arbitrary internet host.
export function classifyIp(ip: string): IpCategory {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return 'UNKNOWN'
  const [a, b] = [Number(m[1]), Number(m[2])]
  if (a === 10) return 'PRIVATE_IP'
  if (a === 172 && b >= 16 && b <= 31) return 'PRIVATE_IP'
  if (a === 192 && b === 168) return 'PRIVATE_IP'
  if (a === 127) return 'PRIVATE_IP'
  if (a === 169 && b === 254) return 'PRIVATE_IP'
  return 'PUBLIC_IP'
}
