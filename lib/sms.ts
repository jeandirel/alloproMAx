// Pluggable SMS / OTP provider abstraction — mirrors lib/kyc.ts's pattern (interface + safe
// default + env-driven selection). Real phone authentication (auth.ts CredentialsProvider('phone'),
// distinct from the DemoOtp simulation in app/login/actions.ts + components/otp-login.tsx) sends
// its one-time code through this abstraction so a real SMS vendor can be plugged in later without
// touching auth.ts.

export interface SmsSendResult { ok: boolean; error?: string }

export interface SmsProvider {
  sendOtp(phoneE164: string, code: string): Promise<SmsSendResult>
}

/**
 * Safe default: logs the code server-side instead of sending a real SMS. This is the intended
 * delivery channel until a real vendor is configured (local/dev/preview) — sendOtp always
 * returns ok:true, it never fabricates a "sent" status for a vendor that failed.
 */
export const consoleSmsProvider: SmsProvider = {
  async sendOtp(phoneE164, code) {
    console.log(`[sms:console] OTP pour ${phoneE164} : ${code} (aucun SMS réel envoyé — configurez SMS_PROVIDER pour la production)`)
    return { ok: true }
  }
}

// ---------------------------------------------------------------------------
// Twilio adapter (https://www.twilio.com/docs/sms/send-messages)
// NON-FUNCTIONAL until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER hold real
// credentials.
// ---------------------------------------------------------------------------
export const twilioSmsProvider: SmsProvider = {
  async sendOtp(phoneE164, code) {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const token = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_FROM_NUMBER
    if (!sid || !token || !from) return { ok: false, error: 'Twilio non configuré (identifiants manquants).' }
    try {
      const basicAuth = Buffer.from(`${sid}:${token}`).toString('base64')
      const body = new URLSearchParams({
        To: phoneE164,
        From: from,
        Body: `Allo Pro : votre code de connexion est ${code} (valable 5 minutes).`,
      })
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return { ok: false, error: `Twilio ${res.status}: ${text.slice(0, 200)}` }
      }
      return { ok: true }
    } catch (e) {
      console.error('[sms] Twilio', e)
      return { ok: false, error: 'Erreur du fournisseur Twilio.' }
    }
  }
}

/**
 * Reads SMS_PROVIDER ('console' | 'twilio', case-insensitive). Falls back to consoleSmsProvider
 * when unset, unrecognized, or when the selected provider's required credentials are missing.
 */
export function getSmsProvider(): SmsProvider {
  const selected = (process.env.SMS_PROVIDER || 'console').trim().toLowerCase()
  if (selected === 'twilio') {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) {
      console.warn('[sms] SMS_PROVIDER=twilio mais les identifiants sont manquants — repli sur le mode console.')
      return consoleSmsProvider
    }
    return twilioSmsProvider
  }
  return consoleSmsProvider
}
