'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SearchBar({ className = '', zone = '' }: { className?: string; zone?: string }) {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (zone) params.set('zone', zone)
    router.push(`/recherche?${params.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          aria-label="Rechercher un service"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Plomberie, ménage, coiffure…"
          className="min-h-14 w-full rounded-2xl border border-border bg-white py-4 pl-12 pr-14 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:pr-36"
        />
        <button aria-label="Lancer la recherche" className="absolute bottom-1.5 right-1.5 top-1.5 flex min-w-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90" type="submit"><Search size={18}/><span className="hidden sm:inline">Rechercher</span></button>
      </div>
    </form>
  )
}
