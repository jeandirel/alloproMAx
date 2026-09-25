export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const VARS = ['DATABASE_URL', 'Allopromax_DATABASE_URL', 'Allopromax_POSTGRES_URL', 'Allopromax_PRISMA_DATABASE_URL']

function schemeOf(value: string | undefined): string | null {
  if (!value) return null
  const idx = value.indexOf('://')
  return idx === -1 ? '(no scheme found)' : value.slice(0, idx + 3)
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('key') !== 'tmp-scheme-check-20260925') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const out: Record<string, string | null> = {}
  for (const name of VARS) out[name] = schemeOf(process.env[name])
  return NextResponse.json(out)
}
