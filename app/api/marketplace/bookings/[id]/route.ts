export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { getBookingForViewer, publicBooking } from '@/lib/marketplace/booking-payment'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers })
  const { id } = await params
  const booking = await getBookingForViewer(session.user.id, id)
  if (!booking) return NextResponse.json({ error: 'Réservation introuvable.' }, { status: 404, headers })
  return NextResponse.json({ booking: publicBooking(booking) }, { headers })
}
