export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/account-guard'
import { pauseAccount } from '@/lib/account-lifecycle'

export async function POST() {
  const result = await requireApiUser()
  if ('response' in result) return result.response
  await pauseAccount(result.user.id)
  return NextResponse.json({ ok: true })
}
