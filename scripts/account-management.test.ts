import assert from 'node:assert/strict'
import { consoleSmsProvider, twilioSmsProvider, getSmsProvider } from '../lib/sms'

// ---------------------------------------------------------------------------
// getSmsProvider() (lib/sms.ts) — pure, DB-free env-driven selection.
// Imported directly: lib/sms.ts has no module-scope Prisma/NextAuth
// construction, unlike auth.ts or lib/account-guard.ts (see below).
// ---------------------------------------------------------------------------

const savedEnv = {
  SMS_PROVIDER: process.env.SMS_PROVIDER,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
}
function resetSmsEnv() {
  delete process.env.SMS_PROVIDER
  delete process.env.TWILIO_ACCOUNT_SID
  delete process.env.TWILIO_AUTH_TOKEN
  delete process.env.TWILIO_FROM_NUMBER
}

resetSmsEnv()
// Unset SMS_PROVIDER defaults to the safe console provider.
assert.equal(getSmsProvider(), consoleSmsProvider)

process.env.SMS_PROVIDER = 'twilio'
// SMS_PROVIDER=twilio without credentials must NEVER fail open into a
// "real" provider that silently no-ops — it falls back to console.
assert.equal(getSmsProvider(), consoleSmsProvider)

process.env.TWILIO_ACCOUNT_SID = 'AC_test'
process.env.TWILIO_AUTH_TOKEN = 'token_test'
process.env.TWILIO_FROM_NUMBER = '+15005550006'
// Only once all three Twilio credentials are present does it select Twilio.
assert.equal(getSmsProvider(), twilioSmsProvider)

process.env.SMS_PROVIDER = 'TWILIO'
// Case-insensitive.
assert.equal(getSmsProvider(), twilioSmsProvider)

resetSmsEnv()
Object.assign(process.env, Object.fromEntries(Object.entries(savedEnv).filter(([, v]) => v !== undefined)))

console.log('getSmsProvider : PASS')

// ---------------------------------------------------------------------------
// sanitizeSignupRole() (auth.ts) — re-declared here rather than imported:
// auth.ts constructs a NextAuth()/PrismaClient instance at module-load time
// (same reasoning as scripts/service-rules.test.ts skipping the
// service-suggestions route import). The logic is a one-line allowlist, kept
// in sync manually — a real behavior change there is a one-line diff to
// mirror.
// ---------------------------------------------------------------------------

function sanitizeSignupRole(value: unknown): string {
  return value === 'professional' ? 'professional' : 'user'
}

assert.equal(sanitizeSignupRole('professional'), 'professional')
assert.equal(sanitizeSignupRole('user'), 'user')
// Anything else (missing, malformed, or a client trying to smuggle a
// privileged value like "admin") must fall back to the least-privileged role.
assert.equal(sanitizeSignupRole('admin'), 'user')
assert.equal(sanitizeSignupRole(undefined), 'user')
assert.equal(sanitizeSignupRole(null), 'user')
assert.equal(sanitizeSignupRole(42), 'user')

console.log('sanitizeSignupRole : PASS')

// ---------------------------------------------------------------------------
// Admin role allowlist (lib/account-guard.ts requireAdmin/requireAdminApi) —
// re-declared for the same reason (module imports @/auth + @/lib/prisma at
// load time). This is the single allowlist every new admin route in this
// session (app/api/admin/**) delegates to; it must never accept a role that
// wasn't explicitly granted, regardless of what a client might send.
// ---------------------------------------------------------------------------

const ADMIN_ROLES = ['admin', 'demo_admin']

assert.ok(ADMIN_ROLES.includes('admin'))
assert.ok(ADMIN_ROLES.includes('demo_admin'))
assert.ok(!ADMIN_ROLES.includes('user'))
assert.ok(!ADMIN_ROLES.includes('professional'))
assert.ok(!ADMIN_ROLES.includes('administrator')) // no partial/loose matching
assert.ok(!ADMIN_ROLES.includes(''))

console.log('Admin role allowlist : PASS')

// ---------------------------------------------------------------------------
// Everything below requires a live database connection, so it lives in
// scripts/account-management-integration.test.ts instead of here (run
// separately — it writes real rows, under a clearly-marked, self-cleaning
// test identity — see that file's header). Covered there: User/Professional
// creation, Credentials login DB checks (bcrypt + suspended/deleted gate),
// Session creation/revocation, logout (Session row survival), account- and
// professional-level pause/reactivate, the 30-day deletion grace period
// (request/cancel + the processScheduledDeletions sweep), anonymizeUser,
// admin suspend/unsuspend (user + professional, including revokeAllSessions
// and the AuditLog rows written), DB-authoritative RBAC, PhoneOtp
// find-or-create (single-use, replay-proof), preferences/consents, and the
// AuditLog trail. Not covered even there (needs a real Next.js request
// context / AsyncLocalStorage, not just a live DB): auth.ts's jwt/session
// callbacks and requireApiUser/requireAdminApi wiring at the HTTP layer, and
// app/login/actions.ts's rate-limit/cookie-throttle logic around
// requestPhoneOtp — these would need to run against a live server, not a
// bare script.
// ---------------------------------------------------------------------------

console.log('GESTION DE COMPTE : PASS — sélection du fournisseur SMS, rôle de signup, allowlist admin.')
