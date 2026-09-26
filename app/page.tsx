import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { LandingPage } from './_components/landing-page'

export const metadata = {
  title: 'Allo Pro — Trouvez un professionnel près de chez vous au Gabon',
  description: 'Plomberie, électricité, ménage, coiffure, mécanique, informatique et bien plus. Recherchez un prestataire selon votre besoin et votre localisation, partout au Gabon.',
  openGraph: {
    title: 'Allo Pro — Trouvez un professionnel près de chez vous au Gabon',
    description: 'Recherchez un prestataire selon votre besoin et votre localisation, partout au Gabon.',
  },
}

export default async function Home() {
  const session = await auth()
  if (session?.user) {
    redirect('/accueil')
  }
  return <LandingPage />
}
