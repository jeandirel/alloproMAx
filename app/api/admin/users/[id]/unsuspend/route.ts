export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/account-guard'
import { adminUnsuspendUser } from '@/lib/account-lifecycle'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminApi()
  if ('response' in result) return result.response
  const { id } = await params
  await adminUnsuspendUser(result.user.id, id)
  return NextResponse.json({ ok: true })
}
