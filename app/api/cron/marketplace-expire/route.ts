export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { sweepMarketplaceExpirations } from '@/lib/marketplace/expiry'

// Bascule les ServiceRequest/Offer perimes vers 'expired'. Appele par le cron Vercel defini dans
// vercel.json ; protege par CRON_SECRET, meme convention que /api/cron/process-deletions.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET non configuré.' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await sweepMarketplaceExpirations()
  return NextResponse.json({ ok: true, ...result })
}
