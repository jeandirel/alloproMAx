'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { Smartphone, ShieldAlert, Wrench } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { PageHeading } from '@/components/market-ui'

interface AccountDTO {
  id: string
  name: string | null
  email: string
  phone: string | null
  authProvider: string | null
  phoneVerifiedAt: string | null
  accountStatus: string
  pausedAt: string | null
  deletionRequestedAt: string | null
  deletionScheduledAt: string | null
  createdAt: string
  marketingConsent: boolean
  notifyBookingUpdates: boolean
  notifyMessages: boolean
  notifySecurity: boolean
  notifyMarketing: boolean
  professional: { id: string; paused: boolean; deletedAt: string | null; kycStatus: string } | null
}

interface SessionDTO {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  lastUsedAt: string
  current: boolean
}

const providerLabels: Record<string, string> = {
  credentials: 'E-mail et mot de passe',
  phone: 'Téléphone',
  google: 'Google',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return 'Appareil inconnu'
  if (/mobile|android|iphone/i.test(userAgent)) return 'Appareil mobile'
  if (/ipad|tablet/i.test(userAgent)) return 'Tablette'
  return 'Ordinateur'
}

export function CompteClient({ account, sessions }: { account: AccountDTO; sessions: SessionDTO[] }) {
  const router = useRouter()
  const [name, setName] = useState(account.name ?? '')
  const [prefs, setPrefs] = useState({
    marketingConsent: account.marketingConsent,
    notifyBookingUpdates: account.notifyBookingUpdates,
    notifyMessages: account.notifyMessages,
    notifySecurity: account.notifySecurity,
    notifyMarketing: account.notifyMarketing,
  })
  const [busy, setBusy] = useState<string | null>(null)

  async function request(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Une erreur est survenue.')
    return data
  }

  async function run(key: string, url: string, method: string, body: unknown, successMessage: string) {
    setBusy(key)
    try {
      await request(url, method, body)
      toast.success(successMessage)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    await run('name', '/api/account', 'PATCH', { name }, 'Nom mis à jour')
  }

  async function togglePref(key: keyof typeof prefs) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    try {
      await request('/api/account', 'PATCH', { [key]: next[key] })
    } catch (e) {
      setPrefs(prefs)
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    }
  }

  const isPaused = account.accountStatus === 'paused'
  const isDeletionRequested = account.accountStatus === 'deletion_requested'
  const hasProfessional = !!account.professional && !account.professional.deletedAt

  return (
    <div className="ap-page max-w-2xl">
      <PageHeading
        back="/profil"
        title="Sécurité et confidentialité"
        subtitle="Gérez vos informations, vos appareils connectés et votre compte."
      />

      <div className="space-y-6">
        <section className="ap-panel space-y-4">
          <h2 className="font-bold text-lg">Mes informations</h2>
          <form onSubmit={saveName} className="space-y-3">
            <label className="ap-label">
              Nom
              <input className="ap-input mt-2" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </label>
            <button className="ap-secondary" disabled={busy === 'name' || name.trim() === (account.name ?? '')}>
              Enregistrer
            </button>
          </form>
          <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t border-border/60">
            <p><span suppressHydrationWarning>{account.email}</span></p>
            {account.phone && <p>{account.phone}{account.phoneVerifiedAt ? ' · vérifié' : ''}</p>}
            <p>Connexion via {(account.authProvider && providerLabels[account.authProvider]) ?? account.authProvider ?? 'e-mail'}</p>
            <p>Membre depuis le {formatDate(account.createdAt)}</p>
          </div>
        </section>

        <section className="ap-panel space-y-4">
          <h2 className="font-bold text-lg">Notifications</h2>
          {([
            ['notifyBookingUpdates', 'Mises à jour de mes réservations'],
            ['notifyMessages', 'Nouveaux messages'],
            ['notifySecurity', 'Alertes de sécurité (recommandé)'],
            ['notifyMarketing', 'Offres et actualités Allo Pro'],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="text-sm">{label}</span>
              <Switch checked={prefs[key]} onCheckedChange={() => togglePref(key)} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/60">
            <span className="text-sm">J'accepte d'être contacté(e) à des fins marketing</span>
            <Switch checked={prefs.marketingConsent} onCheckedChange={() => togglePref('marketingConsent')} />
          </div>
        </section>

        <section className="ap-panel space-y-3">
          <h2 className="font-bold text-lg">Appareils connectés</h2>
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0">
              <div className="flex items-center gap-3">
                <Smartphone size={18} className="text-emerald-dark shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">{deviceLabel(s.userAgent)}{s.current ? ' · cet appareil' : ''}</p>
                  <p className="text-xs text-muted-foreground">Actif le {formatDate(s.lastUsedAt)}{s.ipAddress ? ` · ${s.ipAddress}` : ''}</p>
                </div>
              </div>
              {!s.current && (
                <button
                  className="text-xs text-red-700 font-semibold shrink-0"
                  disabled={busy === `session-${s.id}`}
                  onClick={() => run(`session-${s.id}`, `/api/sessions/${s.id}`, 'DELETE', undefined, 'Appareil déconnecté')}
                >
                  Déconnecter
                </button>
              )}
            </div>
          ))}
          {sessions.length > 1 && (
            <button
              className="ap-secondary"
              disabled={busy === 'revoke-all'}
              onClick={() => run('revoke-all', '/api/sessions', 'DELETE', undefined, 'Autres appareils déconnectés')}
            >
              Déconnecter tous les autres appareils
            </button>
          )}
        </section>

        {hasProfessional && (
          <section className="ap-panel space-y-3">
            <h2 className="font-bold text-lg flex items-center gap-2"><Wrench size={18} className="text-emerald-dark" />Profil professionnel</h2>
            <p className="text-sm text-muted-foreground">
              Ces actions concernent uniquement votre fiche professionnelle publique (visibilité, services). Votre compte et votre historique restent intacts.
            </p>
            {account.professional!.paused ? (
              <button
                className="ap-secondary"
                disabled={busy === 'pro-reactivate'}
                onClick={() => run('pro-reactivate', '/api/professional/reactivate', 'POST', undefined, 'Profil professionnel réactivé')}
              >
                Réactiver mon profil professionnel
              </button>
            ) : (
              <button
                className="ap-secondary"
                disabled={busy === 'pro-pause'}
                onClick={() => run('pro-pause', '/api/professional/pause', 'POST', undefined, 'Profil professionnel mis en pause')}
              >
                Mettre mon profil professionnel en pause
              </button>
            )}
            <button
              className="text-red-700 font-semibold text-sm block"
              disabled={busy === 'pro-delete'}
              onClick={() => {
                if (!window.confirm('Supprimer votre profil professionnel ? Votre fiche publique et vos services seront retirés. Votre compte Allo Pro et votre historique resteront actifs. Cette action est irréversible.')) return
                run('pro-delete', '/api/professional', 'DELETE', undefined, 'Profil professionnel supprimé')
              }}
            >
              Supprimer mon profil professionnel
            </button>
          </section>
        )}

        <section className="ap-panel space-y-3">
          <h2 className="font-bold text-lg flex items-center gap-2"><ShieldAlert size={18} className="text-emerald-dark" />Mon compte</h2>

          {isDeletionRequested ? (
            <>
              <p className="text-sm text-muted-foreground">
                Suppression de votre compte demandée. Sans action de votre part, vos données personnelles seront définitivement effacées le{' '}
                {account.deletionScheduledAt ? formatDate(account.deletionScheduledAt) : '—'}.
              </p>
              <button
                className="ap-button"
                disabled={busy === 'cancel-delete'}
                onClick={() => run('cancel-delete', '/api/account/cancel-delete', 'POST', undefined, 'Suppression annulée, votre compte reste actif')}
              >
                Annuler la suppression
              </button>
            </>
          ) : isPaused ? (
            <>
              <p className="text-sm text-muted-foreground">Votre compte est en pause depuis le {account.pausedAt ? formatDate(account.pausedAt) : '—'}. Il est invisible des autres utilisateurs.</p>
              <button
                className="ap-button"
                disabled={busy === 'reactivate'}
                onClick={() => run('reactivate', '/api/account/reactivate', 'POST', undefined, 'Compte réactivé')}
              >
                Réactiver mon compte
              </button>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium">Mettre mon compte en pause</p>
                <p className="text-xs text-muted-foreground mb-2">Votre compte devient invisible temporairement. Vous pouvez le réactiver à tout moment en vous reconnectant.</p>
                <button
                  className="ap-secondary"
                  disabled={busy === 'pause'}
                  onClick={() => run('pause', '/api/account/pause', 'POST', undefined, 'Compte mis en pause')}
                >
                  Mettre en pause
                </button>
              </div>
              <div className="pt-3 border-t border-border/60">
                <p className="text-sm font-medium">Supprimer mon compte</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Vous aurez 30 jours pour changer d'avis. Passé ce délai, vos données personnelles seront définitivement effacées.
                </p>
                <button
                  className="text-red-700 font-semibold text-sm"
                  disabled={busy === 'delete-request'}
                  onClick={() => {
                    if (!window.confirm("Demander la suppression de votre compte ? Vous aurez 30 jours pour annuler avant l'effacement définitif de vos données.")) return
                    run('delete-request', '/api/account/delete-request', 'POST', undefined, 'Suppression demandée')
                  }}
                >
                  Supprimer mon compte
                </button>
              </div>
            </>
          )}

          <button
            className="text-sm text-muted-foreground hover:text-foreground pt-3 border-t border-border/60 block"
            onClick={() => signOut({ redirectTo: '/' })}
          >
            Se déconnecter
          </button>
        </section>
      </div>
    </div>
  )
}
