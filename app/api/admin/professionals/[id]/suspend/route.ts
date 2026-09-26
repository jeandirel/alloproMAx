export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/account-guard'
import { adminSuspendProfessional } from '@/lib/account-lifecycle'

const bodySchema = z.object({ reason: z.string().trim().min(3).max(500) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminApi()
  if ('response' in result) return result.response
  const { id } = await params
  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Un motif de suspension (au moins 3 caractères) est requis.' }, { status: 400 })
  }
  await adminSuspendProfessional(result.user.id, id, body.reason)
  return NextResponse.json({ ok: true })
}
