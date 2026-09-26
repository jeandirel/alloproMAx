import Link from 'next/link'

const links = [
  { href: '/recherche', label: 'Trouver un professionnel' },
  { href: '/signup', label: 'Devenir professionnel' },
  { href: '/#comment-ca-marche', label: 'Comment ça marche' },
  { href: '/a-propos', label: 'À propos' },
  { href: '/contact', label: 'Contact' },
  { href: '/aide', label: "Centre d'aide" },
  { href: '/cgu', label: 'CGU' },
  { href: '/confidentialite', label: 'Politique de confidentialité' },
  { href: '/mentions-legales', label: 'Mentions légales' },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-white px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-emerald-dark transition-colors">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <p className="font-display text-lg font-bold text-emerald-dark">Allo Pro</p>
          <p className="mt-1 text-sm text-muted-foreground">Une solution Ogooué AI</p>
          <p className="mt-1 text-sm text-muted-foreground">Contact : contact@ogooueia.com</p>
          <p className="mt-4 text-xs text-muted-foreground">© 2026 Allo Pro – Tous droits réservés</p>
          <p className="text-xs text-muted-foreground">Une solution pensée pour le Gabon.</p>
        </div>
      </div>
    </footer>
  )
}
