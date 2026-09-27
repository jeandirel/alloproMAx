export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { handlePawaPayContactUnlockCallback } from '@/lib/marketplace/contact-unlock'
import { handlePawaPayBookingDepositCallback } from '@/lib/marketplace/booking-payment'
import { handlePawaPayRefundCallback } from '@/lib/marketplace/refunds'
import { handlePawaPayPayoutCallback } from '@/lib/marketplace/payouts'
import { isFinal } from '@/lib/payment-types'
import { pawaPayEnvironment } from '@/lib/pawapay'

const callback = z.object({ depositId: z.string().uuid().optional(), payoutId: z.string().uuid().optional(), refundId: z.string().uuid().optional() })

// Public provider endpoint: NEVER trust a supplied status, amount or identity — every effect uses
// the authenticated pawaPay GET response (see lib/marketplace/contact-unlock.ts). Mirrors
// app/api/payments/pawapay/callback/route.ts (demo) but dispatches into the real PaymentAttempt model.
let warnedMissingCallbackSecret = false
function verifyCallbackAuth(req: Request): boolean {
  const secret = process.env.PAWAPAY_CALLBACK_SECRET
  if (!secret) {
    // En mode mock (aucun jeton pawaPay configuré), aucun trafic réel n'atteint jamais cette route :
    // permissif uniquement pour le développement local. Dès qu'un jeton réel (sandbox/production) est
    // configuré, un secret de callback manquant doit fermer la porte plutôt que l'ouvrir.
    if (pawaPayEnvironment() !== 'mock') return false
    if (!warnedMissingCallbackSecret) { warnedMissingCallbackSecret = true; console.warn('PAWAPAY_CALLBACK_SECRET non configuré : les callbacks pawaPay sont acceptés sans vérification de signature (mode mock uniquement).') }
    return true
  }
  const header = req.headers.get('authorization') || ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  const expected = Buffer.from(secret)
  const actual = Buffer.from(provided)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function POST(req: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!verifyCallbackAuth(req)) {
    console.error('Callback pawaPay (marketplace) rejeté : authentification invalide (vérifier le schéma attendu par pawaPay).')
    return new NextResponse(null, { status: 401, headers })
  }
  try {
    if (Number(req.headers.get('content-length') || 0) > 16384) return new NextResponse(null, { status: 413, headers })
    const raw = await req.text()
    if (raw.length > 16384) return new NextResponse(null, { status: 413, headers })
    const body = callback.parse(JSON.parse(raw))
    const id = body.refundId || body.payoutId || body.depositId
    if (!id || (body.refundId && body.payoutId)) return new NextResponse(null, { status: 400, headers })
    const attempt = await prisma.paymentAttempt.findUnique({ where: { id } })
    if (!attempt) return new NextResponse(null, { status: 200, headers })
    if (attempt.contactUnlockId) {
      const result = await handlePawaPayContactUnlockCallback(attempt.id)
      return new NextResponse(null, { status: result && isFinal(result.attempt.status) ? 200 : 503, headers })
    }
    if (attempt.bookingId && attempt.kind === 'deposit') {
      const result = await handlePawaPayBookingDepositCallback(attempt.id)
      return new NextResponse(null, { status: result && isFinal(result.attempt.status) ? 200 : 503, headers })
    }
    if (attempt.kind === 'refund') {
      const result = await handlePawaPayRefundCallback(attempt.id)
      return new NextResponse(null, { status: result && isFinal(result.attempt.status) ? 200 : 503, headers })
    }
    if (attempt.kind === 'payout') {
      const result = await handlePawaPayPayoutCallback(attempt.id)
      return new NextResponse(null, { status: result && isFinal(result.attempt.status) ? 200 : 503, headers })
    }
    return new NextResponse(null, { status: 200, headers })
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError) return new NextResponse(null, { status: 400, headers })
    console.error('Rapprochement pawaPay (marketplace) indisponible')
    return new NextResponse(null, { status: 503, headers })
  }
}
