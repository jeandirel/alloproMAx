// Feature flags du marketplace transactionnel — lus une seule fois par requête depuis process.env,
// jamais depuis la base (activer/désactiver une fonctionnalité ne doit pas dépendre d'une migration
// ni d'une écriture en base). Défaut : tout désactivé, pour ne jamais exposer une fonctionnalité
// financière avant qu'elle soit explicitement activée en environnement.
function isEnabled(value: string | undefined): boolean {
  return value === 'true' || value === '1'
}

export function isContactUnlockEnabled(): boolean {
  return isEnabled(process.env.CONTACT_UNLOCK_ENABLED)
}

export function isManagedPaymentsEnabled(): boolean {
  return isEnabled(process.env.MANAGED_PAYMENTS_ENABLED)
}

export function isRefundsEnabled(): boolean {
  return isEnabled(process.env.REFUNDS_ENABLED)
}

export function isPayoutsEnabled(): boolean {
  return isEnabled(process.env.PAYOUTS_ENABLED)
}
