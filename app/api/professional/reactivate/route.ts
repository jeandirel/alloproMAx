export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/account-guard'
import { reactivateProfessionalProfile } from '@/lib/account-lifecycle'

export async function POST() {
  const result = await requireApiUser()
  if ('response' in result) return result.response
  if (!result.user.professionalId) return NextResponse.json({ error: "Aucun profil professionnel associé à ce compte." }, { status: 404 })
  await reactivateProfessionalProfile(result.user.id, result.user.professionalId)
  return NextResponse.json({ ok: true })
}
