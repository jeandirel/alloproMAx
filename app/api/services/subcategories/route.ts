export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const categoryId = (new URL(req.url).searchParams.get('categoryId') || '').trim()
  if (!categoryId) return NextResponse.json({ error: 'categoryId requis.' }, { status: 400 })
  const subcategories = await prisma.serviceSubcategory.findMany({
    where: { categoryId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, slug: true, description: true, icon: true, categoryId: true },
  })
  return NextResponse.json({ subcategories }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
