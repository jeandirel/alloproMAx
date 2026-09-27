export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/account-guard'
import { deleteProfessionalProfile } from '@/lib/account-lifecycle'

/**
 * Supprime UNIQUEMENT le profil professionnel (fiche publique, services, disponibilité) — jamais
 * le compte utilisateur, qui reste actif et conserve son historique (reviews, bookings, payouts).
 * Pour supprimer le compte entier, voir POST /api/account/delete-request.
 */
export async function DELETE() {
  const result = await requireApiUser()
  if ('response' in result) return result.response
  if (!result.user.professionalId) return NextResponse.json({ error: "Aucun profil professionnel associé à ce compte." }, { status: 404 })
  await deleteProfessionalProfile(result.user.id, result.user.professionalId)
  return NextResponse.json({ ok: true })
}
