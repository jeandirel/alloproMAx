import { requireAdmin } from '@/lib/account-guard'
import { ComptesClient } from './comptes-client'

export const metadata = {
  title: 'Modération des comptes — Allo Pro',
}

export default async function AdminComptesPage() {
  await requireAdmin()
  return <ComptesClient />
}
