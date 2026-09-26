import { Mail } from 'lucide-react'
import { PublicShell } from '@/components/public-shell'
import { ContactForm } from '@/components/contact-form'

export const metadata = { title: 'Contact — Allo Pro', description: 'Contactez l’équipe Allo Pro.' }

export default function Page() {
  return (
    <PublicShell>
      <main className="ap-page max-w-2xl">
        <h1 className="text-3xl font-bold mb-4">Contact et assistance</h1>
        <p className="text-muted-foreground mb-6">Une question sur Allo Pro, une prestation ou un professionnel ? Écrivez-nous directement, ou connectez-vous pour suivre votre demande depuis votre espace.</p>
        <a href="mailto:contact@ogooueia.com" className="ap-panel mb-5 flex items-center gap-3 !p-5 transition-colors hover:border-primary/30">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Mail size={20}/></span>
          <span>
            <span className="block text-sm text-muted-foreground">Écrivez-nous par e-mail</span>
            <span className="block font-semibold text-foreground">contact@ogooueia.com</span>
          </span>
        </a>
        <ContactForm/>
      </main>
    </PublicShell>
  )
}
