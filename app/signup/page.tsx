import { auth, isGoogleAuthEnabled } from '@/auth'
import { redirect } from 'next/navigation'
import { SignupClient } from './signup-client'

export const metadata = {
  title: 'Créer un compte — Allo Pro',
  description: 'Inscrivez-vous gratuitement sur Allo Pro pour trouver un professionnel ou proposer vos services près de chez vous.',
  openGraph: {
    title: 'Créer un compte — Allo Pro',
    description: 'Inscrivez-vous gratuitement sur Allo Pro pour trouver un professionnel ou proposer vos services.',
  },
}

export default async function SignupPage() {
  const session = await auth()
  if (session?.user) redirect('/accueil')
  return <SignupClient googleAuthEnabled={isGoogleAuthEnabled()} />
}
