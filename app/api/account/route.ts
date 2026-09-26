export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireApiUser } from '@/lib/account-guard'

export async function GET() {
  const result = await requireApiUser()
  if ('response' in result) return result.response
  const user = await prisma.user.findUnique({
    where: { id: result.user.id },
    select: {
      id: true, name: true, email: true, phone: true, image: true, role: true,
      accountStatus: true, authProvider: true, phoneVerifiedAt: true, lastLoginAt: true,
      pausedAt: true, deletionRequestedAt: true, deletionScheduledAt: true,
      marketingConsent: true, notifyBookingUpdates: true, notifyMessages: true,
      notifySecurity: true, notifyMarketing: true, createdAt: true,
      professional: { select: { id: true, paused: true, deletedAt: true, kycStatus: true } },
    },
  })
  return NextResponse.json({ account: user })
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  marketingConsent: z.boolean().optional(),
  notifyBookingUpdates: z.boolean().optional(),
  notifyMessages: z.boolean().optional(),
  notifySecurity: z.boolean().optional(),
  notifyMarketing: z.boolean().optional(),
})

export async function PATCH(req: Request) {
  const result = await requireApiUser()
  if ('response' in result) return result.response
  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
  }
  const user = await prisma.user.update({ where: { id: result.user.id }, data: body })
  return NextResponse.json({
    account: {
      id: user.id, name: user.name, marketingConsent: user.marketingConsent,
      notifyBookingUpdates: user.notifyBookingUpdates, notifyMessages: user.notifyMessages,
      notifySecurity: user.notifySecurity, notifyMarketing: user.notifyMarketing,
    },
  })
}
