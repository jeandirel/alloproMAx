'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PAYMENT_ATTEMPT_TERMINAL_STATUSES } from '@/lib/marketplace-ui/status'

export interface PublicPaymentAttempt {
  id: string
  status: string
  amount: number
  currency: string
  provider: string
  phoneNumber: string
  failureCode?: string | null
}

/**
 * Poll a `{action:'refresh', paymentAttemptId}` endpoint until the attempt reaches a terminal
 * status (COMPLETED/FAILED/REJECTED). The pawaPay webhook usually beats this client-side poll,
 * but it's the safety net for the UI itself (server-side safety net is the marketplace-reconcile
 * cron). Calls onTerminal once, with the final attempt, so callers can re-fetch the parent resource.
 */
export function usePaymentAttemptPolling(refreshUrl: string, onTerminal?: (attempt: PublicPaymentAttempt) => void) {
  const [attempt, setAttempt] = useState<PublicPaymentAttempt | null>(null)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onTerminalRef = useRef(onTerminal)
  onTerminalRef.current = onTerminal

  const start = useCallback((initial: PublicPaymentAttempt) => {
    setAttempt(initial)
    setError(null)
    setPolling(!PAYMENT_ATTEMPT_TERMINAL_STATUSES.includes(initial.status as (typeof PAYMENT_ATTEMPT_TERMINAL_STATUSES)[number]))
  }, [])

  useEffect(() => {
    if (!polling || !attempt) return
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout>

    async function tick() {
      try {
        const res = await fetch(refreshUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refresh', paymentAttemptId: attempt!.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Vérification du paiement impossible.')
        const next: PublicPaymentAttempt = data.attempt ?? attempt
        if (cancelled) return
        setAttempt(next)
        if (PAYMENT_ATTEMPT_TERMINAL_STATUSES.includes(next.status as (typeof PAYMENT_ATTEMPT_TERMINAL_STATUSES)[number])) {
          setPolling(false)
          onTerminalRef.current?.(next)
          return
        }
        timeout = setTimeout(tick, 3000)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Vérification du paiement impossible.')
        timeout = setTimeout(tick, 5000)
      }
    }

    timeout = setTimeout(tick, 3000)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, attempt?.id, refreshUrl])

  return { attempt, polling, error, start }
}
