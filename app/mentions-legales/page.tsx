import Link from 'next/link'

export const metadata = { title: 'Mentions légales — Allo Pro', description: 'Informations légales relatives à l’éditeur de la plateforme Allo Pro.' }

export default function Page() {
  return (
    <main className="ap-page max-w-3xl">
      <Link className="text-emerald-dark" href="/">← Allo Pro</Link>
      <h1 className="text-3xl font-bold mt-6 mb-5">Mentions légales</h1>
      <div className="ap-panel space-y-5">
        <section>
          <h2 className="font-bold">Éditeur de la plateforme</h2>
          <p className="mt-2">La plateforme Allo Pro est éditée par Ogooué AI (Ogooué Artificial Intelligence).</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>SIREN : 929 709 574</li>
            <li>SIRET : 929 709 574 00016</li>
            <li>Site officiel : <a className="text-emerald-dark hover:underline" href="https://ogooueia.com" target="_blank" rel="noopener noreferrer">ogooueia.com</a></li>
            <li>Contact : <a className="text-emerald-dark hover:underline" href="mailto:contact@ogooueia.com">contact@ogooueia.com</a></li>
          </ul>
        </section>
        <section>
          <h2 className="font-bold">Hébergement</h2>
          <p className="mt-2 text-sm text-muted-foreground">La plateforme est hébergée par un prestataire d’hébergement cloud tiers.</p>
        </section>
        <section>
          <h2 className="font-bold">Propriété intellectuelle</h2>
          <p className="mt-2 text-sm text-muted-foreground">L’ensemble des éléments de la plateforme Allo Pro (marque, logo, textes, structure) est la propriété d’Ogooué AI, sauf mention contraire.</p>
        </section>
        <section>
          <h2 className="font-bold">Autres informations</h2>
          <p className="mt-2 text-sm text-muted-foreground">Pour toute question relative à ces mentions légales, consultez nos <Link className="text-emerald-dark hover:underline" href="/cgu">CGU</Link> et notre <Link className="text-emerald-dark hover:underline" href="/confidentialite">politique de confidentialité</Link>, ou contactez-nous directement.</p>
        </section>
      </div>
    </main>
  )
}
