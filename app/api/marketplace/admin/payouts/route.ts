export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/account-guard'
import { listPayoutsForAdmin } from '@/lib/marketplace/admin-finance'

const headers = { 'Cache-Control': 'private, no-store' }
const VALID_STATUSES = new Set(['a_verser', 'echoue', 'verse', 'all'])

export async function GET(req: Request) {
  const admin = await requireAdminApi()
  if ('response' in admin) return admin.response
  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status')
  const status = statusParam && VALID_STATUSES.has(statusParam) ? (statusParam as 'a_verser' | 'echoue' | 'verse' | 'all') : undefined
  const payouts = await listPayoutsForAdmin({ status })
  return NextResponse.json({ payouts }, { headers })
}
