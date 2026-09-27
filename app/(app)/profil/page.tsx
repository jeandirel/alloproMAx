import { auth } from '@/auth'
import { ProfilClient } from './profil-client'

export default async function ProfilPage() {
  const session = await auth()
  return <ProfilClient user={{ name: session?.user?.name ?? 'Utilisateur', email: session?.user?.email ?? '' }} />
}
