export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/account-guard'
import { listLedgerEntries } from '@/lib/marketplace/admin-finance'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(req: Request) {
  const admin = await requireAdminApi()
  if ('response' in admin) return admin.response
  const url = new URL(req.url)
  const type = url.searchParams.get('type') ?? undefined
  const bookingId = url.searchParams.get('bookingId') ?? undefined
  const cursor = url.searchParams.get('cursor') ?? undefined
  const takeParam = url.searchParams.get('take')
  const take = takeParam && Number.isFinite(Number(takeParam)) ? Number(takeParam) : undefined
  const entries = await listLedgerEntries({ type, bookingId, cursor, take })
  return NextResponse.json({ entries }, { headers })
}
