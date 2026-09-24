export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { normalizeServiceName, slugifyService } from '@/lib/service-normalize'

const bodySchema = z.object({
  type: z.enum(['SUBCATEGORY', 'SERVICE']),
  name: z.string().trim().min(2).max(80),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  description: z.string().trim().max(2000).optional(),
})

const patchSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['CATEGORY', 'SUBCATEGORY', 'SERVICE']),
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  synonyms: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  /** SERVICE only — moves the service to a different subcategory (and its parent category). */
  subcategoryId: z.string().optional(),
})

async function requireAdmin() {
  const session = await auth()
  const dbUser = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }) : null
  return dbUser && ['admin', 'demo_admin'].includes(dbUser.role)
}

// Full Category -> ServiceSubcategory -> CatalogService tree plus counts, for
// the admin catalogue-management view (components/admin-services.tsx). The
// ~13/~90/~590 row shape stays small enough to return in one shot for an
// admin-only screen — unlike the public, per-level routes in app/api/services/*
// which stay scoped on purpose (see their own comments).
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const categories = await prisma.category.findMany({
    orderBy: { position: 'asc' },
    include: {
      subcategories: {
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { services: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
      },
    },
  })

  let subcategoriesCount = 0
  let servicesCount = 0
  const shaped = categories.map((c) => {
    subcategoriesCount += c.subcategories.length
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      active: c.active,
      position: c.position,
      subcategories: c.subcategories.map((s) => {
        servicesCount += s.services.length
        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
          isActive: s.isActive,
          sortOrder: s.sortOrder,
          categoryId: s.categoryId,
          services: s.services.map((sv) => ({
            id: sv.id,
            name: sv.name,
            slug: sv.slug,
            description: sv.description,
            keywords: sv.keywords,
            synonyms: sv.synonyms,
            isActive: sv.isActive,
            sortOrder: sv.sortOrder,
            subcategoryId: sv.subcategoryId,
            categoryId: sv.categoryId,
          })),
        }
      }),
    }
  })

  return NextResponse.json(
    { categories: shaped, counts: { categories: categories.length, subcategories: subcategoriesCount, services: servicesCount } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}

// Edits an existing Category / ServiceSubcategory / CatalogService row:
// rename, activate/deactivate, reorder (sortOrder/position), edit
// keywords/synonyms (SERVICE only), or move a service to a different
// subcategory (subcategoryId, SERVICE only). Creation stays on POST below.
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    const body = patchSchema.parse(await req.json())

    if (body.type === 'CATEGORY') {
      const data: Prisma.CategoryUpdateInput = {}
      if (body.name !== undefined) data.name = body.name
      if (body.isActive !== undefined) data.active = body.isActive
      if (body.sortOrder !== undefined) data.position = body.sortOrder
      const category = await prisma.category.update({ where: { id: body.id }, data })
      return NextResponse.json({ category })
    }

    if (body.type === 'SUBCATEGORY') {
      const data: Prisma.ServiceSubcategoryUpdateInput = {}
      if (body.name !== undefined) { data.name = body.name; data.normalizedName = normalizeServiceName(body.name); data.slug = slugifyService(body.name) }
      if (body.description !== undefined) data.description = body.description
      if (body.isActive !== undefined) data.isActive = body.isActive
      if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
      const subcategory = await prisma.serviceSubcategory.update({ where: { id: body.id }, data })
      return NextResponse.json({ subcategory })
    }

    // SERVICE
    const data: Prisma.CatalogServiceUpdateInput = {}
    if (body.name !== undefined) { data.name = body.name; data.normalizedName = normalizeServiceName(body.name); data.slug = slugifyService(body.name) }
    if (body.description !== undefined) data.description = body.description
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
    if (body.keywords !== undefined) data.keywords = { set: body.keywords.map((k) => normalizeServiceName(k)).filter(Boolean) }
    if (body.synonyms !== undefined) data.synonyms = { set: body.synonyms.map((k) => normalizeServiceName(k)).filter(Boolean) }
    if (body.subcategoryId !== undefined) {
      const subcategory = await prisma.serviceSubcategory.findUnique({ where: { id: body.subcategoryId }, select: { id: true, categoryId: true } })
      if (!subcategory) return NextResponse.json({ error: 'Sous-catégorie introuvable.' }, { status: 400 })
      data.subcategory = { connect: { id: subcategory.id } }
      data.category = { connect: { id: subcategory.categoryId } }
    }
    const service = await prisma.catalogService.update({ where: { id: body.id }, data })
    return NextResponse.json({ service })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Vérifiez les champs obligatoires, les formats et les valeurs saisis.' }, { status: 400 })
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return NextResponse.json({ error: 'Une entrée identique existe déjà.' }, { status: 409 })
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return NextResponse.json({ error: 'Introuvable.' }, { status: 404 })
    console.error('Modification du catalogue de services', e)
    return NextResponse.json({ error: 'Modification impossible.' }, { status: 400 })
  }
}

// Manual admin creation of ServiceSubcategory / CatalogService rows —
// distinct from the bulk prisma/seed-data/services-catalogue.json import
// (scripts/import-catalogue.ts). Category itself is intentionally not
// creatable here: the 13 top-level categories are a fixed, product-decided
// taxonomy (see prisma/schema.prisma comment), not something admins add to
// ad hoc.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    const body = bodySchema.parse(await req.json())
    if (body.type === 'SUBCATEGORY' && !body.categoryId) return NextResponse.json({ error: 'categoryId requis pour une sous-catégorie.' }, { status: 400 })
    if (body.type === 'SERVICE' && !body.subcategoryId) return NextResponse.json({ error: 'subcategoryId requis pour un service.' }, { status: 400 })

    const normalizedName = normalizeServiceName(body.name)
    const slug = slugifyService(body.name)

    if (body.type === 'SUBCATEGORY') {
      const dup = await prisma.serviceSubcategory.findFirst({ where: { categoryId: body.categoryId!, normalizedName } })
      if (dup) return NextResponse.json({ error: 'Une sous-catégorie identique existe déjà.' }, { status: 409 })
      const subcategory = await prisma.serviceSubcategory.create({
        data: { categoryId: body.categoryId!, name: body.name, slug, normalizedName, description: body.description ?? null, isActive: true },
      })
      return NextResponse.json({ subcategory })
    }

    const subcategory = await prisma.serviceSubcategory.findUnique({ where: { id: body.subcategoryId! }, select: { id: true, categoryId: true } })
    if (!subcategory) return NextResponse.json({ error: 'Sous-catégorie introuvable.' }, { status: 400 })
    const dup = await prisma.catalogService.findFirst({ where: { subcategoryId: body.subcategoryId!, normalizedName } })
    if (dup) return NextResponse.json({ error: 'Un service identique existe déjà.' }, { status: 409 })
    const service = await prisma.catalogService.create({
      data: {
        categoryId: subcategory.categoryId,
        subcategoryId: body.subcategoryId!,
        name: body.name,
        slug,
        normalizedName,
        description: body.description ?? null,
        isActive: true,
      },
    })
    return NextResponse.json({ service })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Vérifiez les champs obligatoires, les formats et les valeurs saisis.' }, { status: 400 })
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return NextResponse.json({ error: 'Une entrée identique existe déjà.' }, { status: 409 })
    console.error('Création manuelle de catalogue de services', e)
    return NextResponse.json({ error: 'Création impossible.' }, { status: 400 })
  }
}
