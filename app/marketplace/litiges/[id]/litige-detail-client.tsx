'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { formatFCFA } from '@/lib/data'
import { disputeStatus, refundStatus, bookingStatus } from '@/lib/marketplace-ui/status'
import { StatusPillFor } from '@/components/marketplace/status-pill'

type DisputeEvent = { id: string; actorRole: string; message: string; createdAt: string }
type Dispute = {
  id: string
  reason: string
  status: string
  decision: string | null
  decisionReason: string | null
  booking: { code: string; status: string; totalPrice: number }
  events: DisputeEvent[]
}
type Refund = { id: string; amount: number; status: string; createdAt: string }

export function LitigeDetailClient({ disputeId }: { disputeId: string }) {
  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [refund, setRefund] = useState<Refund | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [decisionReason, setDecisionReason] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketplace/disputes/${disputeId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Chargement impossible.')
      setDispute(data.dispute)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chargement impossible.')
    } finally {
      setLoading(false)
    }
  }, [disputeId])

  useEffect(() => {
    load()
  }, [load])

  async function resolve(decision: 'refund' | 'release') {
    if (!decisionReason.trim()) return toast.error('Un motif de décision est requis.')
    setBusy(decision)
    try {
      const res = await fetch(`/api/marketplace/disputes/${disputeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve',
          decision,
          decisionReason: decisionReason.trim(),
          refundAmount: decision === 'refund' && refundAmount.trim() ? Number(refundAmount) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Résolution impossible.')
      setRefund(data.refund)
      toast.success('Litige résolu.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  async function sendMessage() {
    if (!message.trim()) return
    setBusy('message')
    try {
      const res = await fetch(`/api/marketplace/disputes/${disputeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', message: message.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Envoi impossible.')
      setMessage('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  async function retryRefund() {
    if (!refund) return
    setBusy('retry-refund')
    try {
      const res = await fetch(`/api/marketplace/refunds/${refund.id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Relance impossible.')
      setRefund(data.refund)
      toast.success('Vérification relancée auprès de pawaPay.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>
  if (!dispute) return <p className="text-sm text-gray-500">Litige introuvable.</p>

  return (
    <div className="space-y-4">
      <div className="ap-panel">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">{dispute.booking.code}</h1>
          <StatusPillFor map={disputeStatus} status={dispute.status} />
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          <StatusPillFor map={bookingStatus} status={dispute.booking.status} />
          <span>{formatFCFA(dispute.booking.totalPrice)}</span>
        </div>
        <p className="mt-3 text-sm text-gray-700">{dispute.reason}</p>
      </div>

      <div className="ap-panel space-y-2">
        {dispute.events.map((ev) => (
          <div key={ev.id} className="text-xs">
            <span className="font-semibold capitalize">{ev.actorRole}</span> — {ev.message}
          </div>
        ))}
        <div className="flex gap-2 border-t border-gray-100 pt-2">
          <input className="ap-input flex-1 text-sm" placeholder="Ajouter un message" value={message} onChange={(e) => setMessage(e.target.value)} />
          <button onClick={sendMessage} disabled={busy === 'message'} className="ap-secondary text-sm">
            Envoyer
          </button>
        </div>
      </div>

      {dispute.status === 'ouvert' ? (
        <div className="ap-panel space-y-3">
          <p className="text-sm font-semibold text-gray-900">Résoudre le litige</p>
          <textarea className="ap-input" rows={3} placeholder="Motif de la décision" value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} />
          <input
            className="ap-input"
            type="number"
            min={1}
            placeholder={`Montant du remboursement (par défaut : ${formatFCFA(dispute.booking.totalPrice)})`}
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={() => resolve('refund')} disabled={busy === 'refund'} className="ap-button flex-1 text-sm">
              Rembourser le client
            </button>
            <button onClick={() => resolve('release')} disabled={busy === 'release'} className="ap-secondary flex-1 text-sm">
              Valider la mission
            </button>
          </div>
        </div>
      ) : (
        dispute.decision && (
          <div className="ap-panel text-sm">
            <p className="font-semibold text-gray-900">Décision : {dispute.decision === 'refund' ? 'remboursement' : 'validation de la mission'}</p>
            <p className="mt-1 text-gray-600">{dispute.decisionReason}</p>
          </div>
        )
      )}

      {refund && (
        <div className="ap-panel flex items-center justify-between text-sm">
          <span>Remboursement : {formatFCFA(refund.amount)}</span>
          <div className="flex items-center gap-2">
            <StatusPillFor map={refundStatus} status={refund.status} />
            {refund.status !== 'completed' && refund.status !== 'rejected' && (
              <button onClick={retryRefund} disabled={busy === 'retry-refund'} className="ap-secondary text-xs">
                Relancer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
