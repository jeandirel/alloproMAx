import { auth } from '@/auth'
import { AccueilClient } from './accueil-client'

export default async function AccueilPage() {
  const session = await auth()
  const userName = session?.user?.name?.split(' ')?.[0] ?? 'Utilisateur'
  return <AccueilClient userName={userName} />
}
