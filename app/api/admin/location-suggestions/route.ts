export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED']

export async function GET(req: Request) {
  const session = await auth()
  const dbUser = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }) : null
  if (!dbUser || !['admin', 'demo_admin'].includes(dbUser.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const status = new URL(req.url).searchParams.get('status')
  const where = status && VALID_STATUSES.includes(status) ? { status } : {}

  const [suggestions, pending, approved, rejected, cities, neighborhoods] = await Promise.all([
    prisma.locationSuggestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        province: { select: { id: true, name: true } },
        city: { select: { id: true, name: true } },
        submitter: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true } },
      },
    }),
    prisma.locationSuggestion.count({ where: { status: 'PENDING' } }),
    prisma.locationSuggestion.count({ where: { status: 'APPROVED' } }),
    prisma.locationSuggestion.count({ where: { status: 'REJECTED' } }),
    prisma.city.count({ where: { isActive: true } }),
    prisma.neighborhood.count({ where: { isActive: true } }),
  ])

  return NextResponse.json(
    {
      suggestions: suggestions.map((s) => ({
        id: s.id,
        type: s.type,
        provinceId: s.provinceId,
        provinceName: s.province?.name ?? null,
        cityId: s.cityId,
        cityName: s.city?.name ?? null,
        proposedName: s.proposedName,
        normalizedName: s.normalizedName,
        extraInfo: s.extraInfo,
        submittedBy: s.submittedBy,
        submitterName: s.submitter?.name ?? null,
        submitterEmail: s.submitterEmail ?? s.submitter?.email ?? null,
        status: s.status,
        adminComment: s.adminComment,
        reviewedBy: s.reviewedBy,
        reviewerName: s.reviewer?.name ?? null,
        reviewedAt: s.reviewedAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      counts: { pending, approved, rejected, cities, neighborhoods },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
