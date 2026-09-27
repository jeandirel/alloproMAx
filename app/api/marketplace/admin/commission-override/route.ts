export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAdminApi } from '@/lib/account-guard'
import { setCommissionOverride } from '@/lib/marketplace/admin-finance'

const headers = { 'Cache-Control': 'private, no-store' }
const patchSchema = z.object({
  targetType: z.enum(['category', 'subcategory']),
  targetId: z.string().min(1),
  // null efface l'override (retour a l'heritage) — distinct de "non fourni".
  commissionBpsOverride: z.number().int().min(0).max(10000).nullable(),
})

export async function PATCH(req: Request) {
  const admin = await requireAdminApi()
  if ('response' in admin) return admin.response
  try {
    const origin = req.headers.get('origin')
    if (origin && ![req.headers.get('host'), req.headers.get('x-forwarded-host')].includes(new URL(origin).host)) {
      return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403, headers })
    }
    const text = await req.text()
    if (text.length > 4000) return NextResponse.json({ error: 'Demande trop volumineuse.' }, { status: 413, headers })
    const body = patchSchema.parse(JSON.parse(text))
    const updated = await setCommissionOverride(admin.user.id, body.targetType, body.targetId, body.commissionBpsOverride)
    return NextResponse.json({ updated }, { headers })
  } catch (e) {
    const malformed = e instanceof z.ZodError || e instanceof SyntaxError
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Modification de l’override de commission refusée', { category: malformed ? 'validation' : database ? 'database' : 'business' })
    return NextResponse.json({ error: malformed ? 'Vérifiez les paramètres de la demande.' : database ? 'Une opération concurrente ou une indisponibilité empêche cette action. Actualisez puis réessayez.' : e instanceof Error ? e.message : 'Action impossible.' }, { status: database ? 409 : 400, headers })
  }
}
