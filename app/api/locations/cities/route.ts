export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const querySchema = z.object({ provinceId: z.string().trim().min(1).max(50) })

export async function GET(req: Request) {
  const parsed = querySchema.safeParse({ provinceId: new URL(req.url).searchParams.get('provinceId') || '' })
  if (!parsed.success) return NextResponse.json({ error: 'provinceId requis.' }, { status: 400 })
  const { provinceId } = parsed.data
  const cities = await prisma.city.findMany({ where: { provinceId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, provinceId: true } })
  return NextResponse.json({ cities }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
