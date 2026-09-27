import { requireUser } from '@/lib/account-guard'
import { DemandeDetailClient } from './demande-detail-client'

export const metadata = { title: 'Détail de la demande — Allo Pro' }

export default async function DemandeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser()
  const { id } = await params
  return <DemandeDetailClient serviceRequestId={id} />
}
