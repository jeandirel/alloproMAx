'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Mail, Lock, User, Eye, EyeOff, Loader2, Search, Wrench } from 'lucide-react'

type SignupRole = 'user' | 'professional'

export function SignupClient() {
  const router = useRouter()
  const [role, setRole] = useState<SignupRole | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Erreur lors de la création du compte')
        return
      }
      // Auto login
      const signInRes = await signIn('credentials', { email, password, redirect: false })
      if (signInRes?.error) {
        setError('Compte créé, mais erreur de connexion. Essayez de vous connecter.')
      } else {
        router.replace(`/onboarding?role=${role === 'professional' ? 'professionnel' : 'client'}`)
      }
    } catch {
      setError('Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <Link href="/" className="text-2xl font-bold text-emerald-dark font-display mb-1">Allo Pro</Link>
          <p className="text-xs text-muted-foreground mb-8">Le bon professionnel, au bon moment.</p>

          <div className="w-full max-w-sm">
            <h1 className="text-xl font-bold text-foreground font-display text-center mb-6">Créer un compte</h1>
            <p className="text-sm text-muted-foreground text-center mb-6">Pour commencer, dites-nous ce que vous cherchez à faire.</p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setRole('user')}
                className="w-full flex items-start gap-3 p-4 rounded-xl border border-border bg-white text-left hover:border-emerald-dark transition-colors"
              >
                <Search className="w-5 h-5 text-emerald-dark shrink-0 mt-0.5" />
                <span>
                  <strong className="block text-sm text-foreground">Je cherche un professionnel</strong>
                  <small className="block text-muted-foreground mt-1">Réservez une intervention près de chez vous.</small>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setRole('professional')}
                className="w-full flex items-start gap-3 p-4 rounded-xl border border-border bg-white text-left hover:border-emerald-dark transition-colors"
              >
                <Wrench className="w-5 h-5 text-emerald-dark shrink-0 mt-0.5" />
                <span>
                  <strong className="block text-sm text-foreground">Je propose mes services</strong>
                  <small className="block text-muted-foreground mt-1">Créez votre profil professionnel sur Allo Pro.</small>
                </span>
              </button>
            </div>

            <p className="text-xs text-center text-muted-foreground mt-6">
              Déjà un compte ?{' '}
              <Link href="/login" className="text-emerald-dark font-medium hover:underline">Se connecter</Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <Link href="/" className="text-2xl font-bold text-emerald-dark font-display mb-1">Allo Pro</Link>
        <p className="text-xs text-muted-foreground mb-8">Le bon professionnel, au bon moment.</p>

        <div className="w-full max-w-sm">
          <button type="button" onClick={() => setRole(null)} className="text-xs text-muted-foreground hover:text-emerald-dark mb-2">&larr; Changer mon choix</button>
          <h1 className="text-xl font-bold text-foreground font-display text-center mb-1">Créer un compte</h1>
          <p className="text-xs text-muted-foreground text-center mb-6">{role === 'professional' ? 'Vous proposez vos services.' : 'Vous cherchez un professionnel.'}</p>

          {error && (
            <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg mb-4 text-center">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Nom complet</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Votre nom complet"
                  required
                  className="w-full pl-10 pr-3 py-2.5 bg-white rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-dark/20 focus:border-emerald-dark"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                  className="w-full pl-10 pr-3 py-2.5 bg-white rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-dark/20 focus:border-emerald-dark"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-white rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-dark/20 focus:border-emerald-dark"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold hover:bg-gold-dark disabled:opacity-60 text-slate-950 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Créer mon compte
            </button>
          </form>

          <p className="text-xs text-center text-muted-foreground mt-6">
            Déjà un compte ?{' '}
            <Link href="/login" className="text-emerald-dark font-medium hover:underline">Se connecter</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
