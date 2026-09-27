// i18n foundation (Phase 4): locale-aware formatting helpers, additive to
// `formatFCFA` in `lib/data.ts` (which is left untouched and keeps working as-is).

const GABON_LOCAL_NUMBER = /^[67]\d{7}$/

function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/**
 * Formats a monetary amount for display.
 *
 * `amountMinor` follows the common "amount in the currency's smallest unit"
 * convention (e.g. cents for EUR/USD). XAF has no minor unit, so for the default
 * currency this is simply the whole-FCFA amount — exactly like the existing
 * `formatFCFA(amount)` helper in `lib/data.ts`. Calling `formatCurrency(amount)`
 * with no options reproduces `formatFCFA(amount)` character-for-character, so
 * nothing already on screen changes.
 */
export function formatCurrency(amountMinor: number, opts?: { locale?: string; currency?: string }): string {
  const locale = opts?.locale ?? 'fr-GA'
  const currency = (opts?.currency ?? 'XAF').toUpperCase()

  if (currency === 'XAF') {
    // Same construction as formatFCFA: plain grouped number + literal " FCFA".
    // (Intl's built-in `style: 'currency'` formatting for XAF inserts a
    // non-breaking space instead of a plain one before "FCFA", which would be a
    // silent behavior change for every existing formatFCFA call site.)
    return `${new Intl.NumberFormat(locale).format(amountMinor)} FCFA`
  }

  const fractionDigits = currencyFractionDigits(currency)
  const amount = amountMinor / 10 ** fractionDigits
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}

/**
 * Formats a raw phone number for display.
 *
 * Defaults to Gabon's +241 convention for the 8-digit local numbers used
 * elsewhere in the app (see the shared validation pattern in
 * lib/marketplace-engine.ts and the normalization in lib/pawapay.ts:
 * an optional +241 / 00241 / leading 0 prefix, then [6-7] + 7 digits).
 *
 * Accepts a `country` for a future non-Gabon rollout; unrecognized countries (and
 * numbers that don't match the expected Gabonese shape) are returned trimmed but
 * otherwise unchanged, rather than guessed at or corrupted.
 */
export function formatPhone(raw: string, country: string = 'GA'): string {
  const trimmed = raw.trim()

  if (country.toUpperCase() === 'GA') {
    let digits = trimmed.replace(/[\s()+-]/g, '')
    digits = digits.replace(/^00241/, '241')
    if (digits.startsWith('241')) digits = digits.slice(3)
    if (digits.startsWith('0')) digits = digits.slice(1)
    if (!GABON_LOCAL_NUMBER.test(digits)) return trimmed
    const groups = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6), digits.slice(6, 8)]
    return `+241 ${groups.join(' ')}`
  }

  // No generic international formatting without a phone-number library, which was
  // deliberately not added for this foundation (see report). Return input as-is.
  return trimmed
}
