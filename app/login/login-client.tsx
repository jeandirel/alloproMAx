'use client'

import { useState } from 'react'
import { OtpLogin } from '@/components/otp-login'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'

export function LoginClient({ allowDemoAuth }: { allowDemoAuth: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await signIn('credentials', { email, password, redirect: false })
      if (res?.error) {
        setError('Email ou mot de passe incorrect')
      } else {
        router.replace('/accueil')
      }
    } catch {
      setError('Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <Link href="/" className="text-2xl font-bold text-emerald-dark font-display mb-1">Allo-Pro</Link>
        <p className="text-xs text-muted-foreground mb-8">Le bon professionnel, au bon moment.</p>

        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-foreground font-display text-center mb-6">Connexion</h1>
          
          {error && (
            <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg mb-4 text-center">{error}</div>
          )}

          {allowDemoAuth && <OtpLogin />}
          {allowDemoAuth && <button className="ap-secondary w-full mb-6" disabled={loading} onClick={async()=>{setLoading(true);try{const result=await signIn('demo-admin',{redirect:false});if(result?.error)setError('Impossible d’ouvrir la démonstration administrateur.');else router.replace('/administration')}catch(e){console.error(e);setError('Connexion indisponible.')}finally{setLoading(false)}}}>Explorer l’administration (nouvelle démo privée)</button>}
          <h2 className="text-sm font-semibold mb-3">Ou retrouver votre compte par e-mail</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder="Votre mot de passe"
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
              className="w-full bg-emerald-dark hover:bg-emerald-dark/90 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Se connecter
            </button>
          </form>

          <p className="text-xs text-center text-muted-foreground mt-6">
            Pas encore de compte ?{' '}
            <Link href="/signup" className="text-emerald-dark font-medium hover:underline">Créer un compte</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
