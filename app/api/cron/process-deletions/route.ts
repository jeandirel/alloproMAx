export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { processScheduledDeletions } from '@/lib/account-lifecycle'

/**
 * Anonymise les comptes dont la période de rétractation (30 jours, voir lib/account-lifecycle.ts)
 * est arrivée à échéance. Appelé par le cron Vercel défini dans vercel.json (quotidien) ; protégé
 * par CRON_SECRET — Vercel envoie automatiquement `Authorization: Bearer ${CRON_SECRET}` pour les
 * cron jobs déclarés dans vercel.json. Sans CRON_SECRET configuré, la route refuse tout appel
 * plutôt que de tourner grande ouverte.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET non configuré.' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const processed = await processScheduledDeletions()
  return NextResponse.json({ ok: true, processed })
}
