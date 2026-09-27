'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, HandCoins, Handshake, ShieldCheck } from 'lucide-react'

export function MarketplaceNav({ isProfessional, isAdmin }: { isProfessional: boolean; isAdmin: boolean }) {
  const pathname = usePathname()
  const items = [
    { href: '/marketplace/demandes', label: 'Mes demandes', icon: ClipboardList, show: true },
    { href: '/marketplace/offres', label: 'Offres', icon: Handshake, show: isProfessional },
    { href: '/marketplace/reservations', label: 'Réservations', icon: HandCoins, show: true },
    { href: '/marketplace/admin', label: 'Finance admin', icon: ShieldCheck, show: isAdmin },
  ].filter((i) => i.show)

  return (
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/marketplace/demandes" className="text-sm font-bold text-emerald-900">
          Allo Pro · Paiements réels
        </Link>
        <nav className="flex flex-wrap gap-1">
          {items.map((item) => {
            const active = pathname?.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active ? 'bg-emerald-50 text-emerald-900' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={14} />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
