export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { normalizeLocationName, slugify } from '@/lib/location-normalize'

const bodySchema = z.object({
  type: z.enum(['PROVINCE', 'CITY', 'NEIGHBORHOOD']),
  name: z.string().trim().min(2).max(80),
  provinceId: z.string().optional(),
  cityId: z.string().optional(),
})

export async function POST(req: Request) {
  const session = await auth()
  const dbUser = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }) : null
  if (!dbUser || !['admin', 'demo_admin'].includes(dbUser.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    const body = bodySchema.parse(await req.json())
    if (body.type === 'CITY' && !body.provinceId) return NextResponse.json({ error: 'provinceId requis pour une ville.' }, { status: 400 })
    if (body.type === 'NEIGHBORHOOD' && !body.cityId) return NextResponse.json({ error: 'cityId requis pour un quartier.' }, { status: 400 })

    const normalizedName = normalizeLocationName(body.name)
    const slug = slugify(body.name)

    if (body.type === 'PROVINCE') {
      const dup = await prisma.province.findFirst({ where: { normalizedName } })
      if (dup) return NextResponse.json({ error: 'Une province identique existe déjà.' }, { status: 409 })
      const location = await prisma.province.create({ data: { name: body.name, slug, normalizedName, isActive: true } })
      return NextResponse.json({ location })
    }
    if (body.type === 'CITY') {
      const dup = await prisma.city.findFirst({ where: { provinceId: body.provinceId!, normalizedName } })
      if (dup) return NextResponse.json({ error: 'Une ville identique existe déjà.' }, { status: 409 })
      const location = await prisma.city.create({ data: { provinceId: body.provinceId!, name: body.name, slug, normalizedName, isActive: true, source: 'admin_manual' } })
      return NextResponse.json({ location })
    }
    const dup = await prisma.neighborhood.findFirst({ where: { cityId: body.cityId!, normalizedName } })
    if (dup) return NextResponse.json({ error: 'Un quartier identique existe déjà.' }, { status: 409 })
    const location = await prisma.neighborhood.create({ data: { cityId: body.cityId!, name: body.name, slug, normalizedName, isActive: true, source: 'admin_manual' } })
    return NextResponse.json({ location })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: 'Vérifiez les champs obligatoires, les formats et les valeurs saisis.' }, { status: 400 })
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return NextResponse.json({ error: 'Une localisation identique existe déjà.' }, { status: 409 })
    console.error('Création manuelle de localisation', e)
    return NextResponse.json({ error: 'Création impossible.' }, { status: 400 })
  }
}
