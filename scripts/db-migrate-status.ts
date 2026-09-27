// Read-only wrapper: runs `prisma migrate status` against Development with the correctly resolved
// DATABASE_URL (see lib/target-env.ts). Never applies/resets/pushes anything itself.
import { spawnSync } from 'node:child_process'
import { resolveTargetEnv } from './lib/target-env'

const resolved = resolveTargetEnv('development')
const proc = spawnSync('npx', ['prisma', 'migrate', 'status'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: resolved.databaseUrl },
})
process.exitCode = proc.status ?? 0
