'use client'

// i18n foundation (Phase 4): a minimal React context + hook around the catalog in
// `./messages.ts`. Deliberately dependency-free (no next-intl/react-intl/etc.).
//
// NOT wired into app/layout.tsx yet — that file is out of scope here. Whoever mounts
// this should wrap the app with <I18nProvider locale={...}> using the current
// User.locale when authenticated (see prisma/schema.prisma `User.locale`, default
// "fr"), falling back to the default locale otherwise. This module does not fetch
// that value itself.

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { defaultLocale, messages, type Locale, type MessageKey } from './messages'

type TranslateFn = (key: MessageKey | (string & {})) => string

export interface I18nContextValue {
  locale: Locale
  t: TranslateFn
}

const I18nContext = createContext<I18nContextValue | null>(null)

function translate(locale: Locale, key: MessageKey | (string & {})): string {
  const catalog = messages[locale] ?? messages[defaultLocale]
  const fromLocale = (catalog as Record<string, string>)[key]
  if (fromLocale !== undefined) return fromLocale
  const fromDefault = (messages[defaultLocale] as Record<string, string>)[key]
  if (fromDefault !== undefined) return fromDefault
  return key
}

/**
 * Wrap (a subtree of) the app with this to make `useTranslations()` available.
 * `locale` is a plain prop — this component does not read cookies/session/DB itself.
 */
export function I18nProvider({ locale = defaultLocale, children }: { locale?: Locale; children: ReactNode }) {
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    t: (key) => translate(locale, key),
  }), [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Returns `{ locale, t }` for the closest <I18nProvider>. If no provider is mounted
 * (e.g. before the orchestrator wires one into app/layout.tsx), this falls back to
 * the default locale instead of throwing, so components can start using it early.
 */
export function useTranslations(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (ctx) return ctx
  return { locale: defaultLocale, t: (key) => translate(defaultLocale, key) }
}
