// Resolves DATABASE_URL for exactly one named target, with zero silent fallback across
// environment boundaries. This exists so `npm run db:status:dev` / `db:predeploy` / `db:migrate:dev`
// never guess which database they're talking to (see docs/account-management.md §13 — the whole
// P1001 saga was caused by an implicit, silently-wrong DATABASE_URL resolution).
//
// development : resolved via loadAppEnv() (.env.local, falling back to .env) — the same precedence
//               Next.js itself uses. This is the only target that ever reads a checked-in file path.
// staging     : requires STAGING_DATABASE_URL to be exported explicitly. No staging environment is
//               known to exist for this project (see docs/account-management.md) — this function
//               will never invent one or fall back to another file.
// production  : requires PRODUCTION_DATABASE_URL to be exported explicitly. Never reads
//               .env.vercel.production or any other file automatically — the operator must paste
//               the value in themselves (e.g. from the Vercel dashboard) as a deliberate, one-time
//               action, never as a standing local file that could be picked up by accident.
import { loadAppEnv } from './load-app-env'

export type TargetEnvName = 'development' | 'staging' | 'production'

export interface ResolvedTarget {
  env: TargetEnvName
  databaseUrl: string
  source: string
}

export function resolveTargetEnv(env: TargetEnvName): ResolvedTarget {
  if (env === 'development') {
    loadAppEnv()
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error(
        'DATABASE_URL not resolved for development (checked .env.development.local, .env.local, .env — none set it).',
      )
    }
    return { env, databaseUrl: url, source: '.env.local / .env, via loadAppEnv (NODE_ENV=development)' }
  }

  if (env === 'staging') {
    const url = process.env.STAGING_DATABASE_URL
    if (!url) {
      throw new Error(
        'No staging environment is configured for this project. Set STAGING_DATABASE_URL explicitly ' +
          'if one now exists — this will not guess or fall back to another file.',
      )
    }
    return { env, databaseUrl: url, source: 'STAGING_DATABASE_URL (explicit env var)' }
  }

  const url = process.env.PRODUCTION_DATABASE_URL
  if (!url) {
    throw new Error(
      'PRODUCTION_DATABASE_URL is not set. This never reads .env, .env.local, or .env.vercel.production ' +
        'automatically for production — export PRODUCTION_DATABASE_URL yourself (e.g. copied once from ' +
        'the Vercel dashboard) to run read-only production checks.',
    )
  }
  return { env, databaseUrl: url, source: 'PRODUCTION_DATABASE_URL (explicit env var)' }
}

export function parseEnvArg(argv: string[], fallback: TargetEnvName = 'development'): TargetEnvName {
  const arg = argv.find((a) => a.startsWith('--env='))
  const value = arg ? arg.slice('--env='.length) : fallback
  if (value !== 'development' && value !== 'staging' && value !== 'production') {
    throw new Error(`Unknown --env=${value}. Expected development | staging | production.`)
  }
  return value
}
