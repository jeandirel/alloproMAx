export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { normalizeLocationName } from '@/lib/location-normalize'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// Basic abuse guard: reject URLs/markup in a free-text place name. Not a
// full sanitizer — this is a name field, not rendered as HTML, but it keeps
// obvious spam/injection attempts out of the moderation queue.
const ABUSE_PATTERN = /https?:\/\/|www\.|[<>]/i

const bodySchema = z.object({
  type: z.enum(['CITY', 'NEIGHBORHOOD']),
  provinceId: z.string().min(1),
  cityId: z.string().min(1).optional(),
  proposedName: z.string().trim().min(2).max(80),
  extraInfo: z.string().trim().max(500).optional(),
  submitterEmail: z.string().email().optional(),
})

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin')
    if (origin && new URL(origin).host !== req.headers.get('host') && new URL(origin).host !== req.headers.get('x-forwarded-host')) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
    const ip = getClientIp(req)
    if (!checkRateLimit(`location-suggestion:${ip}`, 5, 60 * 60000).allowed || !checkRateLimit('global:location-suggestion', 200, 60 * 60000).allowed) {
      return NextResponse.json({ error: 'Trop de suggestions. Réessayez plus tard.' }, { status: 429 })
    }
    const session = await auth()
    const body = bodySchema.parse(await req.json())
    if (body.type === 'NEIGHBORHOOD' && !body.cityId) return NextResponse.json({ error: 'Ville requise pour un quartier.' }, { status: 400 })
    if (ABUSE_PATTERN.test(body.proposedName)) return NextResponse.json({ error: 'Nom invalide.' }, { status: 400 })
    const normalizedName = normalizeLocationName(body.proposedName)

    if (body.type === 'CITY') {
      const existing = await prisma.city.findFirst({ where: { provinceId: body.provinceId, normalizedName }, select: { id: true, name: true } })
      if (existing) return NextResponse.json({ status: 'exists', existing })
    } else {
      const existing = await prisma.neighborhood.findFirst({ where: { cityId: body.cityId!, normalizedName }, select: { id: true, name: true } })
      if (existing) return NextResponse.json({ status: 'exists', existing })
    }

    // The pending-duplicate check below (findFirst) and the create() that
    // follows are not atomic on their own: two near-simultaneous submissions
    // for the same (type, provinceId, cityId, normalizedName) could both pass
    // the check before either has committed its create, producing two PENDING
    // rows for the same location. A Postgres session-level advisory lock
    // scoped to that natural key serializes concurrent requests for the same
    // location without requiring a schema/migration change (unlike a DB
    // unique constraint, this also works correctly when cityId is null for
    // CITY-type suggestions, since NULL never equals NULL under a unique
    // index). hashtextextended() collapses the key to a stable bigint;
    // pg_advisory_xact_lock automatically releases the lock at transaction
    // end (commit or rollback), so nothing can be left locked.
    const lockKey = `location-suggestion:${body.type}:${body.provinceId}:${body.cityId ?? ''}:${normalizedName}`
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
      const pending = await tx.locationSuggestion.findFirst({ where: { type: body.type, provinceId: body.provinceId, cityId: body.cityId ?? null, normalizedName, status: 'PENDING' } })
      if (pending) return { status: 'already_pending' as const }

      await tx.locationSuggestion.create({
        data: {
          type: body.type,
          provinceId: body.provinceId,
          cityId: body.cityId ?? null,
          proposedName: body.proposedName,
          normalizedName,
          extraInfo: body.extraInfo ?? null,
          submittedBy: session?.user?.id ?? null,
          submitterEmail: body.submitterEmail ?? null,
          status: 'PENDING',
        },
      })
      return { status: 'created' as const }
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Vérifiez les champs obligatoires, les formats et les valeurs saisis.' }, { status: 400 })
    console.error('Suggestion de localisation', e)
    return NextResponse.json({ error: 'Suggestion impossible.' }, { status: 400 })
  }
}
