import { auth } from '@/auth'
import { AccueilClient } from './accueil-client'

export const metadata = { title: 'Accueil — Allo Pro', description: 'Votre tableau de bord Allo Pro : missions en cours, professionnels favoris et recherches rapides.', openGraph: { title: 'Accueil — Allo Pro', description: 'Votre tableau de bord Allo Pro.' } }

export default async function AccueilPage() {
  const session = await auth()
  const userName = session?.user?.name?.split(' ')?.[0] ?? 'Utilisateur'
  return <AccueilClient userName={userName} />
}
