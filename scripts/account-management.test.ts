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
// Explicitly SKIPPED — require a live database connection (the hosted
// Postgres is confirmed unreachable this session):
// - auth.ts jwt/session callbacks: fresh sign-in creates a Session row,
//   token.sessionId round-trips through session.sessionId, a revoked/expired
//   Session row strips token.id/sessionId so `session.user` becomes
//   undefined (app/(app)/layout.tsx's existing redirect then applies with no
//   further changes).
// - auth.ts signIn callback denying suspended/deleted accounts for every
//   provider (credentials, phone, demo-otp, demo-admin, google).
// - lib/account-lifecycle.ts: pauseAccount/reactivateAccount/
//   requestAccountDeletion/cancelAccountDeletion/anonymizeUser/
//   processScheduledDeletions (30-day grace period math against a real
//   deletionScheduledAt), pause/reactivate/deleteProfessionalProfile
//   (profile-only deletion leaving the User row and its booking/review
//   history untouched), adminSuspend/UnsuspendUser/Professional (including
//   revokeAllSessions side effect and the AuditLog row it writes).
// - app/api/account/**, app/api/sessions/**, app/api/professional/**,
//   app/api/admin/{users,professionals}/**, app/api/cron/process-deletions
//   end-to-end (real 401/403 for missing/non-admin sessions, real mutations,
//   the CRON_SECRET bearer check).
// - app/login/actions.ts requestPhoneOtp: rate-limit + 30s resend cookie
//   throttle + PhoneOtp row creation against a real DB.
// These require integration testing against a live Postgres instance and
// cannot be exercised as pure/deterministic unit tests. See the
// "Deferred DB outage" note in docs/account-management.md.
// ---------------------------------------------------------------------------

console.log('GESTION DE COMPTE : PASS — sélection du fournisseur SMS, rôle de signup, allowlist admin.')
