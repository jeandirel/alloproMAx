import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { isDemoAuthEnabled } from '@/lib/demo-mode'
import { LoginClient } from './login-client'

export const metadata = {
  title: 'Connexion — Allo Pro',
  description: 'Connectez-vous à votre compte Allo Pro pour réserver un professionnel, suivre vos missions ou gérer votre activité.',
  openGraph: {
    title: 'Connexion — Allo Pro',
    description: 'Connectez-vous à votre compte Allo Pro pour réserver un professionnel ou gérer votre activité.',
  },
}

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect('/accueil')
  return <LoginClient allowDemoAuth={isDemoAuthEnabled()} />
}
