export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Best-effort popularity counter: called once when a user actually PICKS a
// search result (not on every keystroke of app/api/services/search).
// Deliberately fire-and-forget in spirit — a missed/duplicated increment is
// harmless, so this stays a single unconditional increment with no extra
// locking/dedup machinery.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.catalogService.update({
      where: { id },
      data: { searchCount: { increment: 1 } },
      select: { id: true },
    })
    return NextResponse.json({ ok: true })
  } catch {
    // Not found or transient DB error — this is a non-critical analytics
    // counter, so we swallow the error rather than surface a user-facing 500.
    return NextResponse.json({ ok: false })
  }
}
