export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { normalizeServiceName } from '@/lib/service-normalize'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// Basic abuse guard: reject URLs/markup in a free-text service name. Not a
// full sanitizer — this is a name field, not rendered as HTML, but it keeps
// obvious spam/injection attempts out of the moderation queue.
const ABUSE_PATTERN = /https?:\/\/|www\.|[<>]/i

const bodySchema = z.object({
  proposedName: z.string().trim().min(2).max(80),
  categoryId: z.string().min(1).optional(),
  subcategoryId: z.string().min(1).optional(),
  description: z.string().trim().max(500).optional(),
  submitterEmail: z.string().email().optional(),
})

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin')
    if (origin && new URL(origin).host !== req.headers.get('host') && new URL(origin).host !== req.headers.get('x-forwarded-host')) return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403 })
    const ip = getClientIp(req)
    if (!checkRateLimit(`service-suggestion:${ip}`, 5, 60 * 60000).allowed || !checkRateLimit('global:service-suggestion', 200, 60 * 60000).allowed) {
      return NextResponse.json({ error: 'Trop de suggestions. Réessayez plus tard.' }, { status: 429 })
    }
    const session = await auth()
    const body = bodySchema.parse(await req.json())
    if (ABUSE_PATTERN.test(body.proposedName)) return NextResponse.json({ error: 'Nom invalide.' }, { status: 400 })
    const normalizedName = normalizeServiceName(body.proposedName)

    if (body.subcategoryId) {
      const existing = await prisma.catalogService.findFirst({ where: { subcategoryId: body.subcategoryId, normalizedName }, select: { id: true, name: true } })
      if (existing) return NextResponse.json({ status: 'exists', existing })
    }

    const pending = await prisma.serviceSuggestion.findFirst({
      where: { categoryId: body.categoryId ?? null, subcategoryId: body.subcategoryId ?? null, normalizedName, status: 'PENDING' },
    })
    if (pending) return NextResponse.json({ status: 'already_pending' })

    await prisma.serviceSuggestion.create({
      data: {
        proposedName: body.proposedName,
        normalizedName,
        categoryId: body.categoryId ?? null,
        subcategoryId: body.subcategoryId ?? null,
        description: body.description ?? null,
        submittedBy: session?.user?.id ?? null,
        submitterEmail: body.submitterEmail ?? null,
        status: 'PENDING',
      },
    })
    return NextResponse.json({ status: 'created' })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Vérifiez les champs obligatoires, les formats et les valeurs saisis.' }, { status: 400 })
    console.error('Suggestion de service', e)
    return NextResponse.json({ error: 'Suggestion impossible.' }, { status: 400 })
  }
}
