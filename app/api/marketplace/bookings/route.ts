export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listBookingsForClient, listBookingsForProfessional, publicBooking } from '@/lib/marketplace/booking-payment'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
  const view = new URL(req.url).searchParams.get('view')
  if (view === 'professional') {
    const professional = await prisma.professional.findUnique({ where: { userId: session.user.id }, select: { id: true } })
    if (!professional) return NextResponse.json({ error: 'Profil professionnel introuvable pour ce compte.' }, { status: 404, headers })
    const bookings = await listBookingsForProfessional(professional.id)
    return NextResponse.json({ bookings: bookings.map(publicBooking) }, { headers })
  }
  const bookings = await listBookingsForClient(session.user.id)
  return NextResponse.json({ bookings: bookings.map(publicBooking) }, { headers })
}
