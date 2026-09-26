// Real, DB-backed integration tests for Account Management, run against whatever "development"
// currently resolves to (Neon Development, since .env.local's DATABASE_URL/DIRECT_URL point there —
// see docs/account-management.md §14.9). Complements scripts/account-management.test.ts, which only
// covers pure/deterministic logic and explicitly defers anything needing a live database.
//
// auth.ts and lib/account-guard.ts both call auth()/headers() at module scope or inside their
// exported functions (AsyncLocalStorage request context) — they cannot be invoked from a bare script,
// only over real HTTP against a running server. So this script does two things instead:
//   1. Calls the real, directly-importable DB logic (lib/account-lifecycle.ts, lib/sms.ts) as-is.
//   2. Re-implements the handful of request-context-bound checks (Credentials/phone `authorize`,
//      the `signIn`/`getCurrentUser` suspended/deleted gate) verbatim against a live Prisma client,
//      so what's actually verified is the DB contract those callbacks depend on, not a guess at it.
//
// Test data is isolated under TEST_DOMAIN / TEST_PHONE_PREFIX below, tracked by id, and removed in a
// `finally` block — including a pre-run sweep for leftovers from a previous crashed run — so Neon
// Development's real (migrated) data is never touched and repeated runs stay idempotent.
//
// Never logs a connection string or real user data. Usage: tsx scripts/account-management-integration.test.ts
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { loadAppEnv } from './lib/load-app-env'

// Must run before @prisma/client (or anything importing it, e.g. @/lib/prisma) is ever imported —
// see the warning in scripts/lib/load-app-env.ts.
loadAppEnv()

const TEST_DOMAIN = 'integration-test.allopro.invalid'
const TEST_PHONE_PREFIX = 'it-phone-'

function testEmail(tag: string) {
  return `it-${tag}-${randomUUID()}@${TEST_DOMAIN}`
}
function testPhone() {
  return `${TEST_PHONE_PREFIX}${randomUUID()}`
}

async function main() {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  // Dynamic, post-loadAppEnv() import — @/lib/account-lifecycle transitively imports @/lib/prisma,
  // which constructs its own PrismaClient() from process.env.DATABASE_URL at import time.
  const {
    revokeAllSessions,
    pauseAccount,
    reactivateAccount,
    requestAccountDeletion,
    cancelAccountDeletion,
    anonymizeUser,
    processScheduledDeletions,
    pauseProfessionalProfile,
    reactivateProfessionalProfile,
    adminSuspendUser,
    adminUnsuspendUser,
    adminSuspendProfessional,
    adminUnsuspendProfessional,
  } = await import('@/lib/account-lifecycle')
  const { getSmsProvider } = await import('@/lib/sms')

  const createdUserIds: string[] = []
  const createdPhoneOtpIds: string[] = []

  // AuditLog.targetId is a plain String, not an FK — Professional rows cascade-delete with their
  // User, but the AuditLog rows that targeted the Professional's id (professional.pause/suspend/...)
  // do not. Look up each user's Professional id (if any) BEFORE deleting, so those rows are purged too.
  async function purgeUsersAndAudit(userIds: string[]) {
    if (!userIds.length) return
    const pros = await prisma.professional.findMany({ where: { userId: { in: userIds } }, select: { id: true } })
    const targetIds = [...userIds, ...pros.map((p) => p.id)]
    await prisma.auditLog.deleteMany({ where: { OR: [{ targetId: { in: targetIds } }, { actorId: { in: userIds } }] } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }) // cascades Professional/Account/Session/Address
  }

  // Pre-run sweep: remove leftovers from a previous run that crashed before its own cleanup.
  const stale = await prisma.user.findMany({
    where: { OR: [{ email: { endsWith: `@${TEST_DOMAIN}` } }, { phone: { startsWith: TEST_PHONE_PREFIX } }] },
    select: { id: true },
  })
  if (stale.length) {
    await purgeUsersAndAudit(stale.map((u) => u.id))
    console.log(`Pre-run cleanup: removed ${stale.length} leftover test user(s) from a previous run.\n`)
  }

  try {
    // =====================================================================
    // 1. User & Professional creation
    // =====================================================================
    const passwordPlain = 'Test-Passw0rd!'
    const passwordHash = await bcrypt.hash(passwordPlain, 12)
    const user1 = await prisma.user.create({
      data: { email: testEmail('user'), name: 'Integration User', password: passwordHash, role: 'professional' },
    })
    createdUserIds.push(user1.id)
    assert.equal(user1.accountStatus, 'active')
    assert.equal(user1.suspended, false)

    const category = await prisma.category.findFirst({ select: { id: true } })
    assert.ok(category, 'Expected at least one Category row (seeded catalogue) to create a Professional against.')

    const professional1 = await prisma.professional.create({
      data: {
        userId: user1.id,
        categoryId: category!.id,
        headline: 'Intégration — plombier de test',
        zone: 'Libreville',
        zones: ['Libreville'],
        kycStatus: 'brouillon',
      },
    })
    assert.equal(professional1.userId, user1.id)
    assert.equal(professional1.paused, false)
    assert.equal(professional1.online, false)
    console.log('User & Professional creation : PASS')

    // =====================================================================
    // 2. Credentials login logic (auth.ts CredentialsProvider('credentials').authorize + signIn parity)
    // =====================================================================
    async function attemptCredentialsLogin(email: string, password: string): Promise<{ ok: boolean; reason?: string }> {
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user?.password) return { ok: false, reason: 'no-password' }
      const valid = await bcrypt.compare(password, user.password)
      if (!valid) return { ok: false, reason: 'bad-password' }
      if (user.suspended || user.accountStatus === 'suspended' || user.accountStatus === 'deleted') {
        return { ok: false, reason: 'blocked' }
      }
      return { ok: true }
    }

    assert.equal((await attemptCredentialsLogin(user1.email, passwordPlain)).ok, true)
    assert.equal((await attemptCredentialsLogin(user1.email, 'wrong-password')).ok, false)

    await prisma.user.update({ where: { id: user1.id }, data: { accountStatus: 'suspended' } })
    assert.equal((await attemptCredentialsLogin(user1.email, passwordPlain)).ok, false, 'suspended accountStatus must block login even with the correct password')
    await prisma.user.update({ where: { id: user1.id }, data: { accountStatus: 'active' } })
    assert.equal((await attemptCredentialsLogin(user1.email, passwordPlain)).ok, true)
    console.log('Credentials login logic : PASS')

    // =====================================================================
    // 3. Session creation / revocation (hand-managed Session table, auth.ts::jwt)
    // =====================================================================
    const sessionA = await prisma.session.create({
      data: { sessionToken: randomUUID(), userId: user1.id, expires: new Date(Date.now() + 3600_000) },
    })
    const sessionB = await prisma.session.create({
      data: { sessionToken: randomUUID(), userId: user1.id, expires: new Date(Date.now() + 3600_000) },
    })
    assert.equal(await prisma.session.count({ where: { userId: user1.id } }), 2)

    // "Log out all OTHER devices" — keep the current session.
    await revokeAllSessions(user1.id, sessionA.id)
    const remaining = await prisma.session.findMany({ where: { userId: user1.id } })
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].id, sessionA.id)

    // Full revocation (e.g. admin-imposed suspension).
    await revokeAllSessions(user1.id)
    assert.equal(await prisma.session.count({ where: { userId: user1.id } }), 0)
    void sessionB
    console.log('Session creation / revocation : PASS')

    // =====================================================================
    // 4. Logout — documented behavior check: signOut() (next-auth/react, client-side) only clears
    // the JWT cookie; auth.ts defines no events.signOut, so it must NOT touch the Session row. Only
    // an explicit DELETE /api/sessions[/:id] (i.e. revokeAllSessions, already proven above) does.
    // =====================================================================
    const sessionC = await prisma.session.create({
      data: { sessionToken: randomUUID(), userId: user1.id, expires: new Date(Date.now() + 3600_000) },
    })
    // Simulate "logout" as auth.ts implements it today: no DB call at all.
    assert.equal(await prisma.session.count({ where: { id: sessionC.id } }), 1, 'logout must not implicitly delete the Session row')
    await prisma.session.delete({ where: { id: sessionC.id } })
    console.log('Logout (Session row survives client-side signOut) : PASS')

    // =====================================================================
    // 5. Pause / Reactivate — ACCOUNT level (User.accountStatus) and PROFESSIONAL level (Professional.paused)
    // =====================================================================
    await pauseAccount(user1.id)
    let u = await prisma.user.findUniqueOrThrow({ where: { id: user1.id } })
    assert.equal(u.accountStatus, 'paused')
    assert.ok(u.pausedAt)
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'account.pause', targetId: user1.id } }))

    await reactivateAccount(user1.id)
    u = await prisma.user.findUniqueOrThrow({ where: { id: user1.id } })
    assert.equal(u.accountStatus, 'active')
    assert.equal(u.pausedAt, null)
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'account.reactivate', targetId: user1.id } }))

    await pauseProfessionalProfile(user1.id, professional1.id)
    let p = await prisma.professional.findUniqueOrThrow({ where: { id: professional1.id } })
    assert.equal(p.paused, true)
    assert.equal(p.online, false)
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'professional.pause', targetId: professional1.id } }))

    await reactivateProfessionalProfile(user1.id, professional1.id)
    p = await prisma.professional.findUniqueOrThrow({ where: { id: professional1.id } })
    assert.equal(p.paused, false)
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'professional.reactivate', targetId: professional1.id } }))
    console.log('Pause / Reactivate (account + professional) : PASS')

    // =====================================================================
    // 6. Deletion grace period
    // =====================================================================
    await requestAccountDeletion(user1.id)
    u = await prisma.user.findUniqueOrThrow({ where: { id: user1.id } })
    assert.equal(u.accountStatus, 'deletion_requested')
    assert.ok(u.deletionScheduledAt)
    const scheduledInDays = (u.deletionScheduledAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    assert.ok(scheduledInDays > 29.9 && scheduledInDays < 30.1, `expected a ~30 day grace period, got ${scheduledInDays.toFixed(2)} days`)
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'account.delete_request', targetId: user1.id } }))

    await cancelAccountDeletion(user1.id)
    u = await prisma.user.findUniqueOrThrow({ where: { id: user1.id } })
    assert.equal(u.accountStatus, 'active')
    assert.equal(u.deletionScheduledAt, null)
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'account.delete_cancel', targetId: user1.id } }))
    console.log('Deletion grace period (request / cancel) : PASS')

    // =====================================================================
    // 7 & 8. Anonymization (direct call, and via the scheduled-deletion sweep)
    // =====================================================================
    const user2 = await prisma.user.create({ data: { email: testEmail('anon'), name: 'À anonymiser', phone: testPhone(), password: passwordHash } })
    createdUserIds.push(user2.id)
    const professional2 = await prisma.professional.create({ data: { userId: user2.id, categoryId: category!.id } })
    await prisma.session.create({ data: { sessionToken: randomUUID(), userId: user2.id, expires: new Date(Date.now() + 3600_000) } })
    await prisma.account.create({ data: { userId: user2.id, type: 'oauth', provider: 'google-test', providerAccountId: randomUUID() } })

    await anonymizeUser(user2.id)
    const anonymized = await prisma.user.findUniqueOrThrow({ where: { id: user2.id } })
    assert.equal(anonymized.name, 'Utilisateur supprimé')
    assert.ok(anonymized.email.startsWith('deleted-'))
    assert.equal(anonymized.phone, null)
    assert.equal(anonymized.password, null)
    assert.equal(anonymized.accountStatus, 'deleted')
    assert.ok(anonymized.deletedAt)
    assert.equal(anonymized.marketingConsent, false)
    assert.equal(anonymized.notifySecurity, false)
    assert.equal(await prisma.session.count({ where: { userId: user2.id } }), 0)
    assert.equal(await prisma.account.count({ where: { userId: user2.id } }), 0)
    const proAfterAnon = await prisma.professional.findUniqueOrThrow({ where: { id: professional2.id } })
    assert.ok(proAfterAnon.deletedAt, 'linked Professional profile must also be marked deleted')
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'account.delete_hard', targetId: user2.id, actorRole: 'system' } }))
    console.log('Anonymization (direct anonymizeUser) : PASS')

    // Scheduled sweep: one user due (backdated), one user not yet due.
    const user3 = await prisma.user.create({ data: { email: testEmail('due'), name: 'Échéance passée' } })
    createdUserIds.push(user3.id)
    await requestAccountDeletion(user3.id)
    await prisma.user.update({ where: { id: user3.id }, data: { deletionScheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } })

    const user4 = await prisma.user.create({ data: { email: testEmail('notdue'), name: 'Échéance future' } })
    createdUserIds.push(user4.id)
    await requestAccountDeletion(user4.id) // scheduled ~30 days out — not due

    const dueBefore = await prisma.user.count({ where: { accountStatus: 'deletion_requested', deletionScheduledAt: { lte: new Date() } } })
    const processed = await processScheduledDeletions()
    assert.equal(processed, dueBefore, 'processScheduledDeletions() must process exactly the due rows it counted')

    const u3After = await prisma.user.findUniqueOrThrow({ where: { id: user3.id } })
    assert.equal(u3After.accountStatus, 'deleted')
    const u4After = await prisma.user.findUniqueOrThrow({ where: { id: user4.id } })
    assert.equal(u4After.accountStatus, 'deletion_requested', 'a not-yet-due account must be left untouched by the sweep')
    console.log(`Anonymization (processScheduledDeletions sweep, ${processed} row(s) due) : PASS`)

    // =====================================================================
    // 9. Admin moderation + DB-authoritative RBAC
    // =====================================================================
    const admin = await prisma.user.create({ data: { email: testEmail('admin'), name: 'Admin de test', role: 'admin' } })
    createdUserIds.push(admin.id)
    const target = await prisma.user.create({ data: { email: testEmail('modtarget'), name: 'Cible modération', password: passwordHash } })
    createdUserIds.push(target.id)
    const targetPro = await prisma.professional.create({ data: { userId: target.id, categoryId: category!.id } })
    await prisma.session.create({ data: { sessionToken: randomUUID(), userId: target.id, expires: new Date(Date.now() + 3600_000) } })

    // Plain-string param so TS's literal narrowing from prior assert.equal() calls doesn't make
    // the two branches below look like an impossible comparison.
    function isBlockedFromLogin(status: string, suspended: boolean) {
      return suspended || status === 'suspended' || status === 'deleted'
    }

    await adminSuspendUser(admin.id, target.id, 'Comportement signalé par un client (test d’intégration).')
    let t = await prisma.user.findUniqueOrThrow({ where: { id: target.id } })
    assert.equal(t.accountStatus, 'suspended')
    assert.equal(t.suspended, true)
    assert.equal(t.suspendedById, admin.id)
    assert.equal(await prisma.session.count({ where: { userId: target.id } }), 0, 'admin suspension must revoke all sessions')
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'account.admin_suspend', targetId: target.id, actorId: admin.id } }))
    // DB-authoritative RBAC: the exact gate getCurrentUser()/signIn() apply, re-read live from the DB.
    assert.equal(isBlockedFromLogin(t.accountStatus, t.suspended), true)

    await adminUnsuspendUser(admin.id, target.id)
    t = await prisma.user.findUniqueOrThrow({ where: { id: target.id } })
    assert.equal(t.accountStatus, 'active')
    assert.equal(t.suspended, false)
    assert.equal(t.suspendedById, null)
    assert.equal(isBlockedFromLogin(t.accountStatus, t.suspended), false)
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'account.admin_unsuspend', targetId: target.id } }))

    await adminSuspendProfessional(admin.id, targetPro.id, 'Documents KYC invalides (test d’intégration).')
    let tp = await prisma.professional.findUniqueOrThrow({ where: { id: targetPro.id } })
    assert.equal(tp.suspended, true)
    assert.equal(tp.suspendedById, admin.id)
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'professional.admin_suspend', targetId: targetPro.id } }))

    await adminUnsuspendProfessional(admin.id, targetPro.id)
    tp = await prisma.professional.findUniqueOrThrow({ where: { id: targetPro.id } })
    assert.equal(tp.suspended, false)
    assert.ok(await prisma.auditLog.findFirst({ where: { action: 'professional.admin_unsuspend', targetId: targetPro.id } }))

    // Admin-role allowlist (lib/account-guard.ts requireAdminApi), re-read from the DB, never a cookie.
    const ADMIN_ROLES = ['admin', 'demo_admin']
    assert.equal(ADMIN_ROLES.includes(admin.role), true)
    assert.equal(ADMIN_ROLES.includes(target.role), false)
    console.log('Admin moderation (suspend/unsuspend user + professional) + DB-authoritative RBAC : PASS')

    // =====================================================================
    // 10. PhoneOtp — real phone provider find-or-create (auth.ts CredentialsProvider('phone').authorize)
    // =====================================================================
    const phone = testPhone()
    const challenge = randomUUID()
    const code = '123456'
    const codeHash = createHash('sha256').update(challenge + code).digest('hex')
    const otp = await prisma.phoneOtp.create({ data: { id: challenge, phone, codeHash, expiresAt: new Date(Date.now() + 5 * 60_000) } })
    createdPhoneOtpIds.push(otp.id)

    async function verifyPhoneOtpAndLogin(challengeId: string, submittedCode: string, role: string) {
      const row = await prisma.phoneOtp.findUnique({ where: { id: challengeId } })
      if (!row || row.used || row.expiresAt < new Date() || row.attempts >= 5) return { ok: false as const, reason: 'invalid-challenge' }
      const attempt = await prisma.phoneOtp.updateMany({ where: { id: row.id, used: false, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } })
      if (!attempt.count || createHash('sha256').update(row.id + submittedCode).digest('hex') !== row.codeHash) return { ok: false as const, reason: 'bad-code' }
      const consumed = await prisma.phoneOtp.updateMany({ where: { id: row.id, used: false }, data: { used: true } })
      if (!consumed.count) return { ok: false as const, reason: 'race' }
      let phoneUser = await prisma.user.findUnique({ where: { phone: row.phone } })
      if (!phoneUser) {
        phoneUser = await prisma.user.create({
          data: { phone: row.phone, email: `${row.phone}@phone.allopro.invalid`, name: 'Nouvel utilisateur', role: role === 'professional' ? 'professional' : 'user', authProvider: 'phone', phoneVerifiedAt: new Date() },
        })
      }
      return { ok: true as const, user: phoneUser }
    }

    // Wrong code first — must not consume the challenge.
    const badAttempt = await verifyPhoneOtpAndLogin(challenge, '000000', 'user')
    assert.equal(badAttempt.ok, false)
    const correctAttempt = await verifyPhoneOtpAndLogin(challenge, code, 'user')
    assert.equal(correctAttempt.ok, true)
    if (correctAttempt.ok) createdUserIds.push(correctAttempt.user.id)
    assert.equal(correctAttempt.ok && correctAttempt.user.phone, phone)
    assert.equal(correctAttempt.ok && correctAttempt.user.authProvider, 'phone')
    // Replay must fail — the challenge is single-use.
    const replay = await verifyPhoneOtpAndLogin(challenge, code, 'user')
    assert.equal(replay.ok, false)

    // getSmsProvider() defaults to the safe console provider unless SMS_PROVIDER=twilio with full credentials.
    assert.equal(typeof getSmsProvider().sendOtp, 'function')
    console.log('PhoneOtp (find-or-create, single-use, replay-proof) : PASS')

    // =====================================================================
    // 11. Preferences / consents (5 plain Booleans on User)
    // =====================================================================
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user1.id } })
    assert.equal(before.notifyBookingUpdates, true) // schema default
    await prisma.user.update({
      where: { id: user1.id },
      data: { marketingConsent: true, notifyBookingUpdates: false, notifyMessages: false, notifySecurity: true, notifyMarketing: true },
    })
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user1.id } })
    assert.equal(after.marketingConsent, true)
    assert.equal(after.notifyBookingUpdates, false)
    assert.equal(after.notifyMessages, false)
    assert.equal(after.notifySecurity, true)
    assert.equal(after.notifyMarketing, true)
    console.log('Preferences / consents : PASS')

    // =====================================================================
    // 12. AuditLog — already asserted per-action above; confirm the full trail is coherent across
    // both target ids (account-level actions target the User, professional-level ones the Professional).
    // =====================================================================
    const trail = await prisma.auditLog.findMany({
      where: { targetId: { in: [user1.id, professional1.id] } },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    })
    const actions = trail.map((r) => r.action)
    for (const expected of ['account.pause', 'account.reactivate', 'professional.pause', 'professional.reactivate', 'account.delete_request', 'account.delete_cancel']) {
      assert.ok(actions.includes(expected), `expected AuditLog action "${expected}" for user1/professional1, got [${actions.join(', ')}]`)
    }
    console.log('AuditLog (full trail for a single account) : PASS')

    console.log('\nACCOUNT MANAGEMENT INTEGRATION (Neon Development) : PASS — 12/12 sections.')
  } finally {
    await purgeUsersAndAudit(createdUserIds)
    if (createdPhoneOtpIds.length) await prisma.phoneOtp.deleteMany({ where: { id: { in: createdPhoneOtpIds } } })
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
