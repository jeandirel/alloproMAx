import { requireUser } from '@/lib/account-guard'
import { ReservationsClient } from './reservations-client'

export const metadata = { title: 'Mes réservations — Allo Pro' }

export default async function ReservationsPage() {
  const user = await requireUser()
  return <ReservationsClient isProfessional={!!user.professionalId} />
}
