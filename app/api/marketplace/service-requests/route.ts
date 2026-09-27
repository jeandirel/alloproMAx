export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  createServiceRequest,
  publishServiceRequest,
  cancelServiceRequest,
  listServiceRequestsForClient,
  listOpenServiceRequestsForProfessional,
} from '@/lib/marketplace/service-requests'

const headers = { 'Cache-Control': 'private, no-store' }
const input = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    categoryId: z.string().min(1).max(100),
    subcategoryId: z.string().min(1).max(100).optional(),
    catalogServiceId: z.string().min(1).max(100).optional(),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(4000),
    address: z.string().max(300).optional(),
    quartier: z.string().max(150).optional(),
    neighborhoodId: z.string().min(1).max(100).optional(),
    budgetMinAmount: z.number().int().min(0).optional(),
    budgetMaxAmount: z.number().int().min(0).optional(),
    urgent: z.boolean().optional(),
    preferredDate: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
  }),
  z.object({ action: z.literal('publish'), serviceRequestId: z.string().min(1).max(100) }),
  z.object({ action: z.literal('cancel'), serviceRequestId: z.string().min(1).max(100) }),
])

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
  const view = new URL(req.url).searchParams.get('view')
  if (view === 'professional') {
    const professional = await prisma.professional.findUnique({ where: { userId: session.user.id }, select: { id: true } })
    if (!professional) return NextResponse.json({ error: 'Profil professionnel introuvable pour ce compte.' }, { status: 404, headers })
    return NextResponse.json({ serviceRequests: await listOpenServiceRequestsForProfessional(professional.id) }, { headers })
  }
  return NextResponse.json({ serviceRequests: await listServiceRequestsForClient(session.user.id) }, { headers })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
  try {
    const origin = req.headers.get('origin')
    if (origin && ![req.headers.get('host'), req.headers.get('x-forwarded-host')].includes(new URL(origin).host)) {
      return NextResponse.json({ error: 'Origine non autorisée.' }, { status: 403, headers })
    }
    const text = await req.text()
    if (text.length > 8000) return NextResponse.json({ error: 'Demande trop volumineuse.' }, { status: 413, headers })
    const body = input.parse(JSON.parse(text))
    if (body.action === 'create') {
      const request = await createServiceRequest({
        clientId: session.user.id,
        categoryId: body.categoryId,
        subcategoryId: body.subcategoryId,
        catalogServiceId: body.catalogServiceId,
        title: body.title,
        description: body.description,
        address: body.address,
        quartier: body.quartier,
        neighborhoodId: body.neighborhoodId,
        budgetMinAmount: body.budgetMinAmount,
        budgetMaxAmount: body.budgetMaxAmount,
        urgent: body.urgent,
        preferredDate: body.preferredDate ? new Date(body.preferredDate) : undefined,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      })
      return NextResponse.json({ serviceRequest: request }, { headers })
    }
    if (body.action === 'publish') {
      const request = await publishServiceRequest(session.user.id, body.serviceRequestId)
      return NextResponse.json({ serviceRequest: request }, { headers })
    }
    const request = await cancelServiceRequest(session.user.id, body.serviceRequestId)
    return NextResponse.json({ serviceRequest: request }, { headers })
  } catch (e) {
    const malformed = e instanceof z.ZodError || e instanceof SyntaxError
    const database = e instanceof Prisma.PrismaClientKnownRequestError || e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientInitializationError
    console.error('Action sur une demande de service refusée', { category: malformed ? 'validation' : database ? 'database' : 'business' })
    return NextResponse.json({ error: malformed ? 'Vérifiez les paramètres de la demande.' : database ? 'Une opération concurrente ou une indisponibilité empêche cette action. Actualisez puis réessayez.' : e instanceof Error ? e.message : 'Action impossible.' }, { status: database ? 409 : 400, headers })
  }
}
