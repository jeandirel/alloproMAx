export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req)
    if (!checkRateLimit(`signup:${ip}`, 10, 15 * 60000).allowed || !checkRateLimit('global:signup', 300, 15 * 60000).allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, { status: 429 })
    }
    const { email, password, name } = await req.json()
    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 })
    }
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 })
    }
    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, password: hashed, name },
    })
    return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
