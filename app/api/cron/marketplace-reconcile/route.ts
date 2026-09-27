export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { sweepStalePaymentAttempts } from '@/lib/marketplace/reconciliation'

// Reverifie aupres de pawaPay les tentatives de paiement non terminales (deblocage de contact,
// acompte, remboursement, versement) qui n'auraient pas recu de notification webhook. Appele par le
// cron Vercel defini dans vercel.json ; protege par CRON_SECRET, meme convention que
// /api/cron/marketplace-expire et /api/cron/marketplace-auto-complete.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET non configuré.' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await sweepStalePaymentAttempts()
  return NextResponse.json({ ok: true, ...result })
}
