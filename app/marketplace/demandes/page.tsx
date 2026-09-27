import { requireUser } from '@/lib/account-guard'
import { DemandesClient } from './demandes-client'

export const metadata = { title: 'Mes demandes — Allo Pro' }

export default async function DemandesPage() {
  await requireUser()
  return <DemandesClient />
}
