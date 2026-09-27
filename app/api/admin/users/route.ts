export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/account-guard'
import type { Prisma } from '@prisma/client'

/** Liste paginée des comptes, pour la modération (recherche par nom/email/téléphone, filtre par statut). */
export async function GET(req: Request) {
  const result = await requireAdminApi()
  if ('response' in result) return result.response

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() || ''
  const status = url.searchParams.get('status')?.trim() || ''
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = 25

  const where: Prisma.UserWhereInput = {
    ...(status ? { accountStatus: status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, email: true, phone: true, role: true, accountStatus: true,
        suspended: true, suspensionReason: true, createdAt: true, lastLoginAt: true,
        professional: { select: { id: true, paused: true, suspended: true, deletedAt: true } },
      },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({ users: rows, total, page, pageSize })
}
