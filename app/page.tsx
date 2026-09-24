import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { LandingPage } from './_components/landing-page'

export default async function Home() {
  const session = await auth()
  if (session?.user) {
    redirect('/accueil')
  }
  return <LandingPage />
}
