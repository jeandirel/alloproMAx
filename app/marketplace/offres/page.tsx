import { requireUser } from '@/lib/account-guard'
import { redirect } from 'next/navigation'
import { OffresClient } from './offres-client'

export const metadata = { title: 'Offres — Allo Pro' }

export default async function OffresPage() {
  const user = await requireUser()
  if (!user.professionalId) redirect('/marketplace/demandes')
  return <OffresClient />
}
