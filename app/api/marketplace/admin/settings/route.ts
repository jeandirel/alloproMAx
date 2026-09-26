export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAdminApi } from '@/lib/account-guard'
import { getMarketplaceSettings } from '@/lib/marketplace/settings'
import { updateMarketplaceSettings } from '@/lib/marketplace/admin-finance'

const headers = { 'Cache-Control': 'private, no-store' }
const patchSchema = z.object({
  platformCommissionBps: z.number().int().min(0).max(10000).optional(),
  contactUnlockFeeAmount: z.number().int().min(0).optional(),
  autoCompleteHours: z.number().int().positive().optional(),
})

export async function GET() {
  const admin = await requireAdminApi()
  if ('response' in admin) return admin.response
  const settings = await getMarketplaceSettings()
  return NextResponse.json({ settings }, { headers })
}

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
    const patch = patchSchema.parse(JSON.parse(text))
    const settings = await updateMarketplaceSettings(admin.user.id, patch)
    return NextResponse.json({ settings }, { headers })
  } catch (e) {
    const malformed = e instanceof z.ZodError || e instanceof SyntaxError
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Modification des réglages refusée', { category: malformed ? 'validation' : database ? 'database' : 'business' })
    return NextResponse.json({ error: malformed ? 'Vérifiez les paramètres de la demande.' : database ? 'Une opération concurrente ou une indisponibilité empêche cette action. Actualisez puis réessayez.' : e instanceof Error ? e.message : 'Action impossible.' }, { status: database ? 409 : 400, headers })
  }
}
