export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { normalizeServiceName, slugifyService } from '@/lib/service-normalize'

const bodySchema = z.object({
  correctedName: z.string().trim().min(2).max(80).optional(),
  // Required when the suggestion itself did not target a subcategory (e.g.
  // the user only picked a category, or picked nothing at all).
  subcategoryId: z.string().min(1).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const dbUser = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }) : null
  if (!dbUser || !['admin', 'demo_admin'].includes(dbUser.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    const { id } = await params
    const raw = await req.text()
    const body = bodySchema.parse(raw ? JSON.parse(raw) : {})

    const suggestion = await prisma.serviceSuggestion.findUnique({ where: { id } })
    if (!suggestion) return NextResponse.json({ error: 'Suggestion introuvable.' }, { status: 404 })
    if (suggestion.status !== 'PENDING') return NextResponse.json({ error: 'Suggestion déjà traitée.' }, { status: 400 })

    const subcategoryId = suggestion.subcategoryId ?? body.subcategoryId
    if (!subcategoryId) return NextResponse.json({ error: 'subcategoryId requis (la suggestion ne ciblait aucune sous-catégorie).' }, { status: 400 })

    const subcategory = await prisma.serviceSubcategory.findUnique({ where: { id: subcategoryId }, select: { id: true, categoryId: true } })
    if (!subcategory) return NextResponse.json({ error: 'Sous-catégorie introuvable.' }, { status: 400 })

    const finalName = body.correctedName?.trim() || suggestion.proposedName
    const normalizedName = normalizeServiceName(finalName)
    const slug = slugifyService(finalName)

    const result = await prisma.$transaction(async (tx) => {
      // Re-checked here (not just at the top of the handler) to close the
      // race window between the initial fetch and this write.
      const dup = await tx.catalogService.findFirst({ where: { subcategoryId, normalizedName } })
      if (dup) throw new Error('DUPLICATE')
      const service = await tx.catalogService.create({
        data: {
          categoryId: subcategory.categoryId,
          subcategoryId,
          name: finalName,
          slug,
          normalizedName,
          description: suggestion.description ?? null,
          isActive: true,
        },
      })
      const updated = await tx.serviceSuggestion.update({
        where: { id },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: session!.user!.id, proposedName: finalName },
      })
      return { service, suggestion: updated }
    })

    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Vérifiez les champs obligatoires, les formats et les valeurs saisis.' }, { status: 400 })
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return NextResponse.json({ error: 'Un service identique existe déjà.' }, { status: 409 })
    if (e instanceof Error && e.message === 'DUPLICATE') return NextResponse.json({ error: 'Un service identique existe déjà.' }, { status: 409 })
    console.error('Approbation suggestion service', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Approbation impossible.' }, { status: 400 })
  }
}
