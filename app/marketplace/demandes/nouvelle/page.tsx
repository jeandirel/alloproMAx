import { requireUser } from '@/lib/account-guard'
import { NouvelleDemandeClient } from './nouvelle-demande-client'

export const metadata = { title: 'Nouvelle demande — Allo Pro' }

export default async function NouvelleDemandePage() {
  await requireUser()
  return <NouvelleDemandeClient />
}
