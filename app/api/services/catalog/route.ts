export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Leaf-level catalogue entries (CatalogService) scoped to one subcategory —
// never the full ~590-row table at once, mirroring
// app/api/locations/neighborhoods/route.ts.
export async function GET(req: Request) {
  const subcategoryId = (new URL(req.url).searchParams.get('subcategoryId') || '').trim()
  if (!subcategoryId) return NextResponse.json({ error: 'subcategoryId requis.' }, { status: 400 })
  const services = await prisma.catalogService.findMany({
    where: { subcategoryId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, slug: true, description: true, subcategoryId: true, categoryId: true },
  })
  return NextResponse.json({ services }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
