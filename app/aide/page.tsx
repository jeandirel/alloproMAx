import Link from 'next/link'

export const metadata = { title: "Centre d'aide — Allo Pro", description: 'Questions fréquentes sur Allo Pro.' }

const faqs = [
  {
    q: 'Comment trouver un professionnel ?',
    a: 'Utilisez la recherche sur la page d’accueil ou la page « Recherche » : indiquez le service recherché et votre ville ou quartier, puis parcourez les profils disponibles.',
  },
  {
    q: 'Comment devenir professionnel sur Allo Pro ?',
    a: 'Créez un compte professionnel depuis la page d’inscription, complétez votre profil (métier, zone d’intervention, tarifs) et il apparaîtra dans les résultats de recherche correspondants.',
  },
  {
    q: 'Allo Pro est-il disponible partout au Gabon ?',
    a: 'Allo Pro est en phase de lancement : la couverture s’étend progressivement, ville après ville. Si aucun professionnel n’est encore visible dans votre zone, vous pouvez consulter les zones voisines ou revenir plus tard.',
  },
  {
    q: 'Comment se passe le paiement d’une prestation ?',
    a: 'Le tarif est à convenir directement avec le professionnel avant la prestation. Les tarifs affichés sur les profils sont indicatifs.',
  },
  {
    q: 'Comment contacter l’équipe Allo Pro ?',
    a: 'Rendez-vous sur la page Contact, ou écrivez directement à contact@ogooueia.com.',
  },
]

export default function Page() {
  return (
    <main className="ap-page max-w-3xl">
      <Link className="text-emerald-dark" href="/">← Allo Pro</Link>
      <h1 className="text-3xl font-bold mt-6 mb-5">Centre d&apos;aide</h1>
      <div className="ap-panel space-y-6">
        {faqs.map((f) => (
          <section key={f.q}>
            <h2 className="font-bold">{f.q}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
          </section>
        ))}
        <section>
          <p className="text-sm text-muted-foreground">Vous ne trouvez pas de réponse à votre question ? <Link className="text-emerald-dark hover:underline" href="/contact">Contactez-nous</Link>.</p>
        </section>
      </div>
    </main>
  )
}
