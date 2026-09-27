export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { normalizeLocationName, slugify } from '@/lib/location-normalize'

const bodySchema = z.object({ correctedName: z.string().trim().min(2).max(80).optional() })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const dbUser = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }) : null
  if (!dbUser || !['admin', 'demo_admin'].includes(dbUser.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    const { id } = await params
    const raw = await req.text()
    const body = bodySchema.parse(raw ? JSON.parse(raw) : {})

    const suggestion = await prisma.locationSuggestion.findUnique({ where: { id } })
    if (!suggestion) return NextResponse.json({ error: 'Suggestion introuvable.' }, { status: 404 })
    if (suggestion.status !== 'PENDING') return NextResponse.json({ error: 'Suggestion déjà traitée.' }, { status: 400 })

    const finalName = body.correctedName?.trim() || suggestion.proposedName
    const normalizedName = normalizeLocationName(finalName)
    const slug = slugify(finalName)

    const result = await prisma.$transaction(async (tx) => {
      if (suggestion.type === 'CITY') {
        if (!suggestion.provinceId) throw new Error('Province manquante.')
        // Re-checked here (not just at the top of the handler) to close the
        // race window between the initial fetch and this write.
        const dup = await tx.city.findFirst({ where: { provinceId: suggestion.provinceId, normalizedName } })
        if (dup) throw new Error('DUPLICATE')
        const location = await tx.city.create({ data: { provinceId: suggestion.provinceId, name: finalName, slug, normalizedName, isActive: true, source: 'user_suggestion' } })
        const updated = await tx.locationSuggestion.update({ where: { id }, data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: session!.user!.id, proposedName: finalName } })
        return { location, suggestion: updated }
      }
      if (!suggestion.cityId) throw new Error('Ville manquante.')
      const dup = await tx.neighborhood.findFirst({ where: { cityId: suggestion.cityId, normalizedName } })
      if (dup) throw new Error('DUPLICATE')
      const location = await tx.neighborhood.create({ data: { cityId: suggestion.cityId, name: finalName, slug, normalizedName, isActive: true, source: 'user_suggestion' } })
      const updated = await tx.locationSuggestion.update({ where: { id }, data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: session!.user!.id, proposedName: finalName } })
      return { location, suggestion: updated }
    })

    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Vérifiez les champs obligatoires, les formats et les valeurs saisis.' }, { status: 400 })
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return NextResponse.json({ error: 'Une localisation identique existe déjà.' }, { status: 409 })
    if (e instanceof Error && e.message === 'DUPLICATE') return NextResponse.json({ error: 'Une localisation identique existe déjà.' }, { status: 409 })
    console.error('Approbation suggestion localisation', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Approbation impossible.' }, { status: 400 })
  }
}
