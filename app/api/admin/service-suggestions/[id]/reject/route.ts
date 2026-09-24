export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const bodySchema = z.object({ adminComment: z.string().trim().max(500).optional() })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const dbUser = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }) : null
  if (!dbUser || !['admin', 'demo_admin'].includes(dbUser.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    const { id } = await params
    const raw = await req.text()
    const body = bodySchema.parse(raw ? JSON.parse(raw) : {})

    const suggestion = await prisma.serviceSuggestion.findUnique({ where: { id }, select: { status: true } })
    if (!suggestion) return NextResponse.json({ error: 'Suggestion introuvable.' }, { status: 404 })
    if (suggestion.status !== 'PENDING') return NextResponse.json({ error: 'Suggestion déjà traitée.' }, { status: 400 })

    const updated = await prisma.serviceSuggestion.update({
      where: { id },
      data: { status: 'REJECTED', adminComment: body.adminComment ?? null, reviewedAt: new Date(), reviewedBy: session!.user!.id },
    })
    return NextResponse.json({ suggestion: updated })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Vérifiez les champs obligatoires, les formats et les valeurs saisis.' }, { status: 400 })
    console.error('Rejet suggestion service', e)
    return NextResponse.json({ error: 'Rejet impossible.' }, { status: 400 })
  }
}
