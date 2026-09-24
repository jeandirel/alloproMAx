import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { LandingPage } from './_components/landing-page'

export const metadata = {
  title: 'Allo-Pro — Trouvez un professionnel vérifié près de chez vous',
  description: 'Réservez des professionnels vérifiés (plomberie, électricité, ménage et plus) à Libreville et partout au Gabon, et payez en toute sécurité sur Allo-Pro.',
  openGraph: {
    title: 'Allo-Pro — Trouvez un professionnel vérifié près de chez vous',
    description: 'Réservez des professionnels vérifiés à Libreville et partout au Gabon, et payez en toute sécurité sur Allo-Pro.',
  },
}

export default async function Home() {
  const session = await auth()
  if (session?.user) {
    redirect('/accueil')
  }
  return <LandingPage />
}
