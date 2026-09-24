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

  const [suggestions, pending, approved, rejected, catalogServices] = await Promise.all([
    prisma.serviceSuggestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { id: true, name: true } },
        subcategory: { select: { id: true, name: true } },
        submitter: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true } },
      },
    }),
    prisma.serviceSuggestion.count({ where: { status: 'PENDING' } }),
    prisma.serviceSuggestion.count({ where: { status: 'APPROVED' } }),
    prisma.serviceSuggestion.count({ where: { status: 'REJECTED' } }),
    prisma.catalogService.count({ where: { isActive: true } }),
  ])

  return NextResponse.json(
    {
      suggestions: suggestions.map((s) => ({
        id: s.id,
        categoryId: s.categoryId,
        categoryName: s.category?.name ?? null,
        subcategoryId: s.subcategoryId,
        subcategoryName: s.subcategory?.name ?? null,
        proposedName: s.proposedName,
        normalizedName: s.normalizedName,
        description: s.description,
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
      counts: { pending, approved, rejected, catalogServices },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
