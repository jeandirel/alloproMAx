'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { formatFCFA } from '@/lib/data'
import { contactUnlockStatus, paymentAttemptStatus } from '@/lib/marketplace-ui/status'
import { StatusPillFor } from '@/components/marketplace/status-pill'
import { MobileMoneyFields, isValidGabonMobile } from '@/components/marketplace/mobile-money-fields'
import { usePaymentAttemptPolling } from '@/hooks/use-payment-attempt-polling'

type ContactUnlockView = {
  id: string
  status: string
  amount: number
  currency: string
  unlockedAt: string | null
  contact: { phone: string | null; name: string | null } | null
}

export function ContactUnlockPanel({ professionalId }: { professionalId: string }) {
  const [unlock, setUnlock] = useState<ContactUnlockView | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [method, setMethod] = useState<'airtel' | 'moov'>('airtel')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [contactUnlockId, setContactUnlockId] = useState<string | null>(null)

  const polling = usePaymentAttemptPolling('/api/marketplace/contact-unlock', async () => {
    if (!contactUnlockId) return
    const res = await fetch(`/api/marketplace/contact-unlock?id=${contactUnlockId}`)
    const data = await res.json()
    if (res.ok) setUnlock(data.contactUnlock)
  })

  async function initiate() {
    if (!isValidGabonMobile(phone)) return toast.error('Numéro Mobile Money invalide.')
    setBusy(true)
    try {
      const res = await fetch('/api/marketplace/contact-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initiate', professionalId, method, phone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Déblocage impossible.')
      setContactUnlockId(data.contactUnlockId)
      if (data.attempt) {
        polling.start(data.attempt)
        toast.info('Paiement envoyé — confirmez sur votre téléphone.')
      } else {
        const viewRes = await fetch(`/api/marketplace/contact-unlock?id=${data.contactUnlockId}`)
        const viewData = await viewRes.json()
        if (viewRes.ok) setUnlock(viewData.contactUnlock)
        toast.success(data.message || 'Contact déjà débloqué.')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  if (unlock?.contact) {
    return (
      <div className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-semibold">{unlock.contact.name ?? 'Professionnel'}</p>
        <p>{unlock.contact.phone ?? 'Numéro indisponible'}</p>
      </div>
    )
  }

  if (!showForm && !polling.attempt) {
    return (
      <button onClick={() => setShowForm(true)} className="ap-secondary mt-2 text-xs">
        Débloquer le contact
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-gray-200 p-3">
      {unlock && (
        <div className="flex items-center justify-between text-xs">
          <span>Frais de déblocage : {formatFCFA(unlock.amount)}</span>
          <StatusPillFor map={contactUnlockStatus} status={unlock.status} />
        </div>
      )}
      {polling.attempt ? (
        <div className="space-y-2 text-sm">
          <StatusPillFor map={paymentAttemptStatus} status={polling.attempt.status} />
          {polling.polling && <p className="text-xs text-gray-500">Vérification en cours auprès de pawaPay…</p>}
          {(polling.attempt.status === 'FAILED' || polling.attempt.status === 'REJECTED') && (
            <button onClick={initiate} disabled={busy} className="ap-button text-sm">
              Réessayer
            </button>
          )}
        </div>
      ) : (
        <>
          <MobileMoneyFields method={method} onMethodChange={setMethod} phone={phone} onPhoneChange={setPhone} disabled={busy} />
          <button onClick={initiate} disabled={busy} className="ap-button w-full text-sm">
            Payer et débloquer le contact
          </button>
        </>
      )}
    </div>
  )
}
