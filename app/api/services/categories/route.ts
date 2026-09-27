export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Small, rarely-changing list (13 top-level categories) — safe to cache and
// to ship in full, unlike the ~590-row CatalogService table which must stay
// scoped by subcategory (see app/api/services/catalog/route.ts).
export async function GET() {
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: { position: 'asc' },
    select: { id: true, name: true, slug: true, icon: true, description: true },
  })
  return NextResponse.json({ categories }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
