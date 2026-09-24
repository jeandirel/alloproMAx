// Limiteur en mémoire (fenêtre fixe). Suffisant pour une seule instance de serveur ; une mise à
// l'échelle horizontale nécessitera un stockage partagé (Redis) — voir rapport Phase 1.
//
// getClientIp() ne peut être fiable que derrière un reverse proxy qui écrase X-Forwarded-For
// avant transmission (Vercel, nginx, l'infra de preview Abacus.ai...) ; sans un tel proxy, un
// client peut forger cet en-tête à chaque requête et obtenir un nouveau compteur à volonté.
// C'est pourquoi tout appelant sensible (signup, login, OTP, demo-admin) doit AUSSI passer par
// un plafond global à clé constante (non falsifiable) en plus du plafond par IP — voir les
// appels `checkRateLimit('global:...', ...)` dans chaque route consommatrice.
const MAX_BUCKETS = 50_000
const buckets = new Map<string, { count: number; resetAt: number }>()

let lastSweep = 0
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  sweep(now)
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value
      if (oldestKey !== undefined) buckets.delete(oldestKey)
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  bucket.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}
