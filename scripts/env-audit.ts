// Read-only. Never prints a secret value, never touches process.env, never imports @prisma/client.
// Answers: which env file holds which DATABASE_URL host, and which variable NAMES (not values)
// exist only in one file — needed before deciding whether a stale file can be corrected, replaced,
// or safely deleted. Run with: npm run env:audit
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { parseDatabaseUrl } from './lib/db-url'

const ROOT = path.resolve(__dirname, '..')
const FILES = ['.env', '.env.local', '.env.development.local', '.env.production.local', '.env.vercel.production']

function line(label: string, value: string) {
  console.log(`${label.padEnd(28)}: ${value}`)
}

function auditFile(file: string) {
  const fullPath = path.join(ROOT, file)
  console.log(`\n[${file}]`)
  if (!fs.existsSync(fullPath)) {
    line('present', 'no')
    return { file, present: false, keys: new Set<string>(), host: null as string | null }
  }
  line('present', 'yes')
  const parsed = dotenv.parse(fs.readFileSync(fullPath, 'utf8'))
  const keys = new Set(Object.keys(parsed))

  const raw = parsed.DATABASE_URL
  if (!raw) {
    line('DATABASE_URL', 'absent')
    return { file, present: true, keys, host: null }
  }
  if (raw === '[SENSITIVE]' || /^\*+$/.test(raw)) {
    line('DATABASE_URL', 'present (value hidden by provider — cannot parse host)')
    return { file, present: true, keys, host: null }
  }
  const db = parseDatabaseUrl(raw)
  if (!db) {
    line('DATABASE_URL', 'present (unparseable — not a postgres:// URL)')
    return { file, present: true, keys, host: null }
  }
  line('DATABASE_URL host', `${db.host}:${db.port}`)
  line('DATABASE_URL database', db.database)
  return { file, present: true, keys, host: db.host }
}

function main() {
  console.log('ENV AUDIT (read-only — no secret value is ever printed)')
  const results = FILES.map(auditFile)

  const env = results.find((r) => r.file === '.env')
  const local = results.find((r) => r.file === '.env.local')

  console.log('\n[key sets — names only, never values]')
  if (env?.present && local?.present) {
    const onlyInEnv = [...env.keys].filter((k) => !local.keys.has(k)).sort()
    const onlyInLocal = [...local.keys].filter((k) => !env.keys.has(k)).sort()
    const shared = [...env.keys].filter((k) => local.keys.has(k)).sort()
    line('keys only in .env', onlyInEnv.length ? onlyInEnv.join(', ') : '(none)')
    line('keys only in .env.local', onlyInLocal.length ? onlyInLocal.join(', ') : '(none)')
    line('keys in both', shared.length ? shared.join(', ') : '(none)')
  }

  console.log('\n[conclusion]')
  if (env?.host && local?.host) {
    if (env.host === local.host) {
      line('.env vs .env.local DATABASE_URL host', 'SAME — no ambiguity between these two files')
    } else {
      line('.env vs .env.local DATABASE_URL host', `DIFFERENT (.env=${env.host} / .env.local=${local.host})`)
    }
  }
  console.log(
    '\nReminder: `npx prisma <command>` run bare (no wrapper) only ever auto-loads ".env" — it does\n' +
      'not know ".env.local" exists. Use the npm run db:status:dev / db:predeploy / db:migrate:dev\n' +
      'scripts instead of a bare `npx prisma` when you need to be certain which database is targeted.',
  )
}

main()
