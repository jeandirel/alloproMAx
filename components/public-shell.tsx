import { auth } from '@/auth'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { WorkspaceProvider } from './workspace-provider'
import { BottomNav } from './bottom-nav'

export async function PublicShell({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (session?.user) return <div className="ap-auth-shell"><WorkspaceProvider><BottomNav/>{children}</WorkspaceProvider></div>
  return <div className="ap-public-shell">
    <header className="sticky top-0 z-30 border-b border-border/50 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-[72px] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight text-primary"><ArrowUpRight className="rounded-lg bg-primary p-1 text-white" size={32}/>Allo-Pro<span className="text-gold">.</span></Link>
        <div className="flex items-center gap-4"><Link href="/recherche" className="hidden text-sm font-semibold text-muted-foreground sm:block">Les services</Link><Link href="/login" className="ap-button !px-3 sm:!px-5">Se connecter</Link></div>
      </div>
    </header>
    <div className="bg-amber-50 px-4 py-2.5 text-center text-xs leading-relaxed text-amber-950">Démonstration · Profils, avis et chiffres fictifs · Paiements simulés</div>
    {children}
  </div>
}
