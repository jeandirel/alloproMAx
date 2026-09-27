export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Small, rarely-changing list (a handful of provinces) — safe to cache and to
// ship in full, unlike cities/neighborhoods which must stay scoped by parent.
export async function GET() {
  const provinces = await prisma.province.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } })
  return NextResponse.json({ provinces }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
