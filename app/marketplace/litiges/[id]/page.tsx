import { requireAdmin } from '@/lib/account-guard'
import { LitigeDetailClient } from './litige-detail-client'

export const metadata = { title: 'Litige — Allo Pro' }

export default async function LitigeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  return <LitigeDetailClient disputeId={id} />
}
