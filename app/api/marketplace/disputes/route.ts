export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/account-guard'
import { listOpenDisputesForAdmin } from '@/lib/marketplace/disputes'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  const result = await requireAdminApi()
  if ('response' in result) return result.response
  const disputes = await listOpenDisputesForAdmin()
  return NextResponse.json({ disputes }, { headers })
}
