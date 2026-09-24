export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

// Pas de bus d'événements (Redis pub/sub, etc.) dans cette pile : on ne peut pas pousser une
// mise à jour au moment exact de l'écriture. On approche l'effet avec un scrutateur serveur à
// intervalle court par connexion, qui ne pousse un événement que si la version a changé — ce qui
// réduit la latence pire cas de 30s à ~2s et supprime les rechargements redondants côté client
// quand rien n'a changé. Ce n'est pas du "temps réel" au sens strict (push-on-write).
const POLL_INTERVAL_MS = 2000
const HEARTBEAT_INTERVAL_MS = 15000
// Limite de connexions SSE simultanées par utilisateur : sans cela, un client pouvait ouvrir un
// nombre illimité de connexions, chacune interrogeant la base toutes les 2s — un vecteur de déni
// de service trivial. Compteur en mémoire : suffisant ici, ce flux ne suppose déjà pas de scaling
// multi-instance (pas de bus d'événements partagé, cf. commentaire ci-dessus).
const MAX_CONNECTIONS_PER_USER = 4
const activeConnections = new Map<string, number>()

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return new Response(JSON.stringify({ error: 'Connexion requise.' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  const userId = session.user.id

  const current = activeConnections.get(userId) ?? 0
  if (current >= MAX_CONNECTIONS_PER_USER) {
    return new Response(JSON.stringify({ error: 'Trop de connexions actives. Fermez un autre onglet puis réessayez.' }), { status: 429, headers: { 'Content-Type': 'application/json' } })
  }
  activeConnections.set(userId, current + 1)
  let released = false
  const release = () => {
    if (released) return
    released = true
    const n = (activeConnections.get(userId) ?? 1) - 1
    if (n <= 0) activeConnections.delete(userId); else activeConnections.set(userId, n)
  }

  const encoder = new TextEncoder()
  let lastVersion: number | null = null
  let closed = false
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let abortListener: (() => void) | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(chunk)) } catch { /* la connexion a pu se fermer entre-temps */ }
      }
      const poll = async () => {
        if (closed) return
        try {
          const row = await prisma.demoWorkspace.findUnique({ where: { userId }, select: { state: true, version: true } })
          if (row && row.version !== lastVersion) {
            lastVersion = row.version
            send(`event: update\ndata: ${JSON.stringify({ state: row.state, version: row.version })}\n\n`)
          }
        } catch (e) {
          console.error('Flux démonstration', e)
        }
      }
      const cleanup = () => {
        if (closed) return
        closed = true
        if (pollTimer) clearInterval(pollTimer)
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        if (abortListener) req.signal.removeEventListener('abort', abortListener)
        release()
        try { controller.close() } catch { /* déjà fermé */ }
      }
      void poll()
      pollTimer = setInterval(() => { void poll() }, POLL_INTERVAL_MS)
      heartbeatTimer = setInterval(() => { send(': heartbeat\n\n') }, HEARTBEAT_INTERVAL_MS)
      abortListener = cleanup
      req.signal.addEventListener('abort', abortListener)
    },
    cancel() {
      closed = true
      if (pollTimer) clearInterval(pollTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (abortListener) req.signal.removeEventListener('abort', abortListener)
      release()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
    },
  })
}
