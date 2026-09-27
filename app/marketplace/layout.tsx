import { requireUser } from '@/lib/account-guard'
import { MarketplaceNav } from '@/components/marketplace/marketplace-nav'

// Zone "paiement réel" : volontairement en dehors de (app)/ et de PublicShell, qui montent toutes
// deux <WorkspaceProvider> (bandeau "Démo privée · Aucun paiement réel" + BottomNav lié à l'ancien
// système). Ici, l'authentification et le rôle viennent uniquement de lib/account-guard.ts
// (source de vérité base de données), jamais de l'état de démo.
export default async function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      <MarketplaceNav isProfessional={!!user.professionalId} isAdmin={['admin', 'demo_admin'].includes(user.role)} />
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  )
}
