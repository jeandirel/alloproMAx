'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, ClipboardList, MessageCircle, User, MapPin, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOptionalWorkspace } from './workspace-provider'

const navItems = [
  { href: '/accueil', label: 'Accueil', icon: Home },
  { href: '/recherche', label: 'Rechercher', icon: Search },
  { href: '/reservations', label: 'Réservations', icon: ClipboardList },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/profil', label: 'Profil', icon: User },
]

export function BottomNav() {
  const pathname = usePathname()
  const ws = useOptionalWorkspace()
  const items = navItems.map((item, i) => i === 0 && ws?.state?.role !== 'client' && ws?.state ? {...item, href: ws.state.role === 'professionnel' ? '/espace-pro' : '/administration', label: 'Mon espace'} : item)
  return (
    <nav aria-label="Navigation principale" className="ap-navigation">
      <div className="mx-auto flex max-w-6xl items-center justify-between lg:px-6">
        <Link href="/accueil" className="hidden items-center gap-2.5 lg:flex" aria-label="Allo-Pro — Accueil">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white"><ArrowUpRight size={24}/></span>
          <span className="font-display text-xl font-extrabold tracking-tight text-primary">Allo-Pro<span className="text-gold">.</span></span>
        </Link>
        <div className="grid h-[72px] w-full grid-cols-5 items-center lg:flex lg:w-auto lg:gap-1">
          {items.map(item => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/')
            return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('mx-0.5 flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-colors lg:mx-0 lg:flex-row lg:gap-2 lg:px-3', active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <item.icon className={cn('h-5 w-5 shrink-0', active && 'stroke-[2.5]')}/><span className="text-[10px] font-semibold sm:text-xs lg:text-sm">{item.label}</span>
            </Link>
          })}
        </div>
        <span className="hidden items-center gap-1 text-xs text-muted-foreground xl:flex"><MapPin size={14}/>Libreville, Gabon</span>
      </div>
    </nav>
  )
}
