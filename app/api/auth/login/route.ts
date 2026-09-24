export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
    }
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user?.password) {
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 })
    }
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 })
    }
    return NextResponse.json({ id: user.id, email: user.email, name: user.name })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
