import { requireUser } from '@/lib/account-guard'
import { ReservationDetailClient } from './reservation-detail-client'

export const metadata = { title: 'Réservation — Allo Pro' }

export default async function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  return <ReservationDetailClient bookingId={id} />
}
