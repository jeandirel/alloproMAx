import { auth } from '@/auth'
import { requireUser } from '@/lib/account-guard'
import { prisma } from '@/lib/prisma'
import { CompteClient } from './compte-client'

export const metadata = {
  title: 'Sécurité et confidentialité — Allo Pro',
}

export default async function ComptePage() {
  const user = await requireUser()
  const [account, session, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true, name: true, email: true, phone: true, authProvider: true,
        phoneVerifiedAt: true, accountStatus: true, pausedAt: true,
        deletionRequestedAt: true, deletionScheduledAt: true, createdAt: true,
        marketingConsent: true, notifyBookingUpdates: true, notifyMessages: true,
        notifySecurity: true, notifyMarketing: true,
        professional: { select: { id: true, paused: true, deletedAt: true, kycStatus: true } },
      },
    }),
    auth(),
    prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true },
    }),
  ])

  return (
    <CompteClient
      account={{
        ...account,
        createdAt: account.createdAt.toISOString(),
        phoneVerifiedAt: account.phoneVerifiedAt?.toISOString() ?? null,
        pausedAt: account.pausedAt?.toISOString() ?? null,
        deletionRequestedAt: account.deletionRequestedAt?.toISOString() ?? null,
        deletionScheduledAt: account.deletionScheduledAt?.toISOString() ?? null,
        professional: account.professional
          ? { ...account.professional, deletedAt: account.professional.deletedAt?.toISOString() ?? null }
          : null,
      }}
      sessions={sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        current: s.id === session?.sessionId,
      }))}
    />
  )
}
