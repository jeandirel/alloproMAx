import Link from 'next/link'

export const metadata = { title: 'À propos — Allo Pro', description: 'Allo Pro, la plateforme qui connecte particuliers et professionnels au Gabon.' }

export default function Page() {
  return (
    <main className="ap-page max-w-3xl">
      <Link className="text-emerald-dark" href="/">← Allo Pro</Link>
      <h1 className="text-3xl font-bold mt-6 mb-5">À propos d&apos;Allo Pro</h1>
      <div className="ap-panel space-y-5">
        <section>
          <h2 className="font-bold">Notre mission</h2>
          <p className="mt-2 text-sm text-muted-foreground">Allo Pro est une plateforme qui met en relation des particuliers avec des professionnels locaux (plomberie, électricité, ménage, coiffure, mécanique, informatique et bien d&apos;autres services) au Gabon, par ville et par quartier.</p>
        </section>
        <section>
          <h2 className="font-bold">Une plateforme en phase de lancement</h2>
          <p className="mt-2 text-sm text-muted-foreground">Allo Pro est actuellement en phase de lancement : le nombre de professionnels inscrits augmente progressivement, ville après ville. Si aucun professionnel n&apos;apparaît encore dans votre zone, vous pouvez être parmi les premiers à créer un profil.</p>
        </section>
        <section>
          <h2 className="font-bold">Qui sommes-nous ?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Allo Pro est une solution développée par Ogooué AI. Retrouvez les informations légales de l&apos;éditeur sur la page <Link className="text-emerald-dark hover:underline" href="/mentions-legales">Mentions légales</Link>.</p>
        </section>
        <section>
          <h2 className="font-bold">Nous contacter</h2>
          <p className="mt-2 text-sm text-muted-foreground">Une question, une suggestion ? Rendez-vous sur notre page <Link className="text-emerald-dark hover:underline" href="/contact">Contact</Link>.</p>
        </section>
      </div>
    </main>
  )
}
