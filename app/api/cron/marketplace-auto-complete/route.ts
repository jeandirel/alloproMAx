export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { sweepAutoCompletions } from '@/lib/marketplace/mission'

// Valide automatiquement les missions dont le delai de contestation (CompletionProof.autoCompleteDeadline)
// est ecoule sans reaction du client. Appele par le cron Vercel defini dans vercel.json ; protege
// par CRON_SECRET, meme convention que /api/cron/marketplace-expire.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET non configuré.' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await sweepAutoCompletions()
  return NextResponse.json({ ok: true, ...result })
}
