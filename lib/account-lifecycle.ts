import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'

// Pause / suspension / suppression du compte utilisateur ET, séparément, du profil professionnel
// (voir schema.prisma: commentaires sur User et Professional). Chaque mutation journalise dans
// AuditLog (modèle générique existant, réutilisé tel quel — aucune nouvelle table).

const DELETION_GRACE_PERIOD_DAYS = 30

interface AuditContext { actorId: string; actorRole: string }

async function logAudit(ctx: AuditContext, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  await prisma.auditLog
    .create({ data: { actorId: ctx.actorId, actorRole: ctx.actorRole, action, targetType, targetId, metadata: (metadata as Prisma.InputJsonValue) ?? undefined } })
    .catch((e) => console.error('[audit]', action, e))
}

/** Révocation immédiate : purge les lignes Session (voir auth.ts::jwt, qui valide leur existence à chaque requête). */
export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } })
}

// ===== Cycle de vie du COMPTE (déclenché par l'utilisateur lui-même) =====

export async function pauseAccount(userId: string) {
  const user = await prisma.user.update({ where: { id: userId }, data: { accountStatus: 'paused', pausedAt: new Date() } })
  await logAudit({ actorId: userId, actorRole: user.role }, 'account.pause', 'User', userId)
  return user
}

export async function reactivateAccount(userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: 'active', pausedAt: null, deletionRequestedAt: null, deletionScheduledAt: null },
  })
  await logAudit({ actorId: userId, actorRole: user.role }, 'account.reactivate', 'User', userId)
  return user
}

export async function requestAccountDeletion(userId: string) {
  const deletionScheduledAt = new Date(Date.now() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
  const user = await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: 'deletion_requested', deletionRequestedAt: new Date(), deletionScheduledAt },
  })
  await logAudit({ actorId: userId, actorRole: user.role }, 'account.delete_request', 'User', userId, { deletionScheduledAt })
  return user
}

export async function cancelAccountDeletion(userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: 'active', deletionRequestedAt: null, deletionScheduledAt: null },
  })
  await logAudit({ actorId: userId, actorRole: user.role }, 'account.delete_cancel', 'User', userId)
  return user
}

/**
 * Anonymisation définitive après la période de rétractation ({@link DELETION_GRACE_PERIOD_DAYS}
 * jours) — jamais un DELETE SQL sur User : conserve la ligne pour préserver l'intégrité
 * référentielle (bookings, reviews, messages historiques) mais en détruit les données
 * personnelles. Distinct de {@link deleteProfessionalProfile} (profil pro seul).
 */
export async function anonymizeUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { professional: { select: { id: true } } } })
  if (!user) return
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        name: 'Utilisateur supprimé',
        email: `deleted-${randomUUID()}@allopro.invalid`,
        phone: null,
        password: null,
        image: null,
        accountStatus: 'deleted',
        deletedAt: new Date(),
        marketingConsent: false,
        notifyBookingUpdates: false,
        notifyMessages: false,
        notifySecurity: false,
        notifyMarketing: false,
      },
    }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.account.deleteMany({ where: { userId } }),
    ...(user.professional ? [prisma.professional.update({ where: { userId }, data: { deletedAt: new Date(), paused: true, online: false } })] : []),
  ])
  await logAudit({ actorId: userId, actorRole: 'system' }, 'account.delete_hard', 'User', userId)
}

/** Traite toutes les suppressions arrivées à échéance — voir app/api/cron/process-deletions/route.ts. */
export async function processScheduledDeletions(): Promise<number> {
  const due = await prisma.user.findMany({
    where: { accountStatus: 'deletion_requested', deletionScheduledAt: { lte: new Date() } },
    select: { id: true },
  })
  for (const { id } of due) await anonymizeUser(id)
  return due.length
}

// ===== Cycle de vie du PROFIL PROFESSIONNEL (distinct du compte utilisateur) =====

export async function pauseProfessionalProfile(userId: string, professionalId: string) {
  const pro = await prisma.professional.update({ where: { id: professionalId }, data: { paused: true, pausedAt: new Date(), online: false } })
  await logAudit({ actorId: userId, actorRole: 'professional' }, 'professional.pause', 'Professional', professionalId)
  return pro
}

export async function reactivateProfessionalProfile(userId: string, professionalId: string) {
  const pro = await prisma.professional.update({ where: { id: professionalId }, data: { paused: false, pausedAt: null } })
  await logAudit({ actorId: userId, actorRole: 'professional' }, 'professional.reactivate', 'Professional', professionalId)
  return pro
}

/** Supprime le PROFIL professionnel uniquement — conserve le compte User et son historique (reviews, bookings, payouts). */
export async function deleteProfessionalProfile(userId: string, professionalId: string) {
  const pro = await prisma.professional.update({
    where: { id: professionalId },
    data: { deletedAt: new Date(), paused: true, online: false },
  })
  await logAudit({ actorId: userId, actorRole: 'professional' }, 'professional.delete_profile', 'Professional', professionalId)
  return pro
}

// ===== Modération administrateur =====

export async function adminSuspendUser(adminId: string, userId: string, reason: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: 'suspended', suspended: true, suspendedAt: new Date(), suspensionReason: reason, suspendedById: adminId },
  })
  await revokeAllSessions(userId)
  await logAudit({ actorId: adminId, actorRole: 'admin' }, 'account.admin_suspend', 'User', userId, { reason })
  return user
}

export async function adminUnsuspendUser(adminId: string, userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: 'active', suspended: false, suspendedAt: null, suspensionReason: null, suspendedById: null },
  })
  await logAudit({ actorId: adminId, actorRole: 'admin' }, 'account.admin_unsuspend', 'User', userId)
  return user
}

export async function adminSuspendProfessional(adminId: string, professionalId: string, reason: string) {
  const pro = await prisma.professional.update({
    where: { id: professionalId },
    data: { suspended: true, suspendedAt: new Date(), suspensionReason: reason, suspendedById: adminId, online: false },
  })
  await logAudit({ actorId: adminId, actorRole: 'admin' }, 'professional.admin_suspend', 'Professional', professionalId, { reason })
  return pro
}

export async function adminUnsuspendProfessional(adminId: string, professionalId: string) {
  const pro = await prisma.professional.update({
    where: { id: professionalId },
    data: { suspended: false, suspendedAt: null, suspensionReason: null, suspendedById: null },
  })
  await logAudit({ actorId: adminId, actorRole: 'admin' }, 'professional.admin_unsuspend', 'Professional', professionalId)
  return pro
}
