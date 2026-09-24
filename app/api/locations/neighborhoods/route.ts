export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const querySchema = z.object({ cityId: z.string().trim().min(1).max(50) })

export async function GET(req: Request) {
  const parsed = querySchema.safeParse({ cityId: new URL(req.url).searchParams.get('cityId') || '' })
  if (!parsed.success) return NextResponse.json({ error: 'cityId requis.' }, { status: 400 })
  const { cityId } = parsed.data
  const neighborhoods = await prisma.neighborhood.findMany({ where: { cityId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, cityId: true } })
  return NextResponse.json({ neighborhoods }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
