'use client'

// Mirrors the server-side validation in lib/pawapay.ts::normalizePhone — a Gabonese mobile number
// after stripping the country code/leading zero must match /^[67][0-9]{7}$/. Kept in sync manually
// since the client check is advisory only; the server re-validates on every payment call.
export function isValidGabonMobile(raw: string): boolean {
  const stripped = raw.replace(/[\s()+-]/g, '').replace(/^00241/, '241')
  const local = stripped.startsWith('241') ? stripped.slice(3) : stripped.startsWith('0') ? stripped.slice(1) : stripped
  return /^[67][0-9]{7}$/.test(local)
}

export function MobileMoneyFields({
  method,
  onMethodChange,
  phone,
  onPhoneChange,
  disabled,
}: {
  method: 'airtel' | 'moov'
  onMethodChange: (m: 'airtel' | 'moov') => void
  phone: string
  onPhoneChange: (p: string) => void
  disabled?: boolean
}) {
  const phoneValid = phone.length === 0 || isValidGabonMobile(phone)
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['airtel', 'moov'] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onMethodChange(m)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition ${
              method === m ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200 text-gray-600'
            }`}
          >
            {m === 'airtel' ? 'Airtel Money' : 'Moov Money'}
          </button>
        ))}
      </div>
      <div>
        <label className="ap-label">Numéro Mobile Money</label>
        <input
          type="tel"
          className="ap-input mt-2"
          placeholder="074345678"
          value={phone}
          disabled={disabled}
          onChange={(e) => onPhoneChange(e.target.value)}
        />
        {!phoneValid && <p className="mt-1 text-xs text-red-600">Numéro Mobile Money gabonais invalide.</p>}
      </div>
    </div>
  )
}
