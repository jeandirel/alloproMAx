'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useMounted } from './client-only'
import { useTranslations } from '@/lib/i18n/context'

const STORAGE_KEY = 'allopro-cookie-consent'

/**
 * Simple bottom cookie-consent banner: Accept + a link to the privacy policy.
 * No reject/customize step (out of scope — a single "Accept" is enough for this
 * demo). Shown once, remembered via localStorage (`allopro-cookie-consent`).
 *
 * Not mounted anywhere by default — add `<CookieConsent />` wherever the app
 * shell is composed (e.g. near the root layout) to enable it.
 */
export function CookieConsent() {
  const mounted = useMounted()
  const { t } = useTranslations()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!mounted) return
    try {
      setVisible(window.localStorage.getItem(STORAGE_KEY) !== 'accepted')
    } catch {
      // Storage blocked (private browsing, hardened settings, etc.): still show the
      // banner: accept() below will simply no-op instead of throwing.
      setVisible(true)
    }
  }, [mounted])

  if (!visible) return null

  const accept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'accepted')
    } catch {
      // Ignore: nothing else to fall back to for persistence here.
    }
    setVisible(false)
  }

  return (
    <div
      role="region"
      aria-label={t('cookies.bannerLabel')}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-white/95 px-4 py-4 backdrop-blur-md pb-[max(16px,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-sm sm:flex-row sm:justify-between">
        <p className="text-center text-muted-foreground sm:text-left">
          {t('cookies.message')}{' '}
          <Link href="/confidentialite" className="font-medium text-emerald-dark underline underline-offset-2">
            {t('cookies.learnMore')}
          </Link>
        </p>
        <button type="button" onClick={accept} className="ap-button shrink-0 px-5 py-2.5">
          {t('cookies.accept')}
        </button>
      </div>
    </div>
  )
}
