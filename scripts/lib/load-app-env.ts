import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

// Reproduces Next.js's own env file precedence (node_modules/next/dist/docs/01-app/02-guides/
// environment-variables.md#environment-variable-load-order) for standalone scripts (db checks,
// migrations preflight, seed). Root cause this fixes: `npx prisma migrate status` and bare `tsx`
// scripts only ever auto-load ".env", never ".env.local" — on this project ".env" holds a stale
// DATABASE_URL (an unreachable private-network host, see docs/account-management.md §Database
// connectivity) while ".env.local" (pulled from Vercel) holds the real, reachable one. Any script
// that must see the same DATABASE_URL the running app sees has to load files in this exact order.
//
// dotenv.config() never overwrites a key already present in process.env, so loading
// highest-precedence-first and letting lower-precedence files only fill gaps reproduces Next.js's
// "stop once found" semantics without needing an `override` flag.
//
// CALL THIS BEFORE IMPORTING `@prisma/client` (or anything that imports it, e.g. lib/prisma.ts).
// Prisma Client's generated module auto-loads ".env" (only ".env", never ".env.local") as a side
// effect of being required/imported — if that import runs first, DATABASE_URL is already set to
// ".env"'s (stale) value by the time loadAppEnv() runs, and every later dotenv.config() call here
// becomes a no-op for that key. This was diagnosed by tracing process.env.DATABASE_URL's host
// after each load step (see docs/account-management.md §Troubleshooting P1001). Import PrismaClient
// dynamically inside a function body (after calling loadAppEnv()) rather than as a static top-level
// import, exactly like scripts/db-connectivity-check.ts does.
export function loadAppEnv(root: string = path.resolve(__dirname, '..', '..')) {
  const nodeEnv = process.env.NODE_ENV || 'development'
  const candidates =
    nodeEnv === 'test'
      ? [`.env.${nodeEnv}`, '.env']
      : [`.env.${nodeEnv}.local`, '.env.local', `.env.${nodeEnv}`, '.env']

  for (const file of candidates) {
    const fullPath = path.join(root, file)
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath })
    }
  }
}
