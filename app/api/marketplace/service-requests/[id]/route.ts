export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServiceRequestDetailForClient, getServiceRequestDetailForProfessional } from '@/lib/marketplace/service-requests'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
  const { id } = await params
  const asClient = await getServiceRequestDetailForClient(session.user.id, id)
  if (asClient) return NextResponse.json({ serviceRequest: asClient }, { headers })
  const professional = await prisma.professional.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  if (professional) {
    const asProfessional = await getServiceRequestDetailForProfessional(professional.id, id)
    if (asProfessional) return NextResponse.json({ serviceRequest: asProfessional }, { headers })
  }
  return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404, headers })
}
