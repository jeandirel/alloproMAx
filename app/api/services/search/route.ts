export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeServiceName, normalizeServiceNameLoose } from '@/lib/service-normalize'
import { rankServiceMatches, type ServiceCandidate } from '@/lib/service-search'

const MAX_QUERY_LENGTH = 80
const CANDIDATES_LIMIT = 100
const MAX_RESULTS = 15

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, MAX_QUERY_LENGTH)
  if (!q) return NextResponse.json({ error: 'q requis.' }, { status: 400 })
  const normalizedQuery = normalizeServiceName(q)
  const looseQuery = normalizeServiceNameLoose(q)

  // Bounded candidate set only — never the full ~590-row table. Matches on
  // normalizedName (substring) or an exact keyword/synonym hit; the finer
  // (typo-tolerant, keyword-substring) scoring happens in rankServiceMatches.
  const rows = await prisma.catalogService.findMany({
    where: {
      isActive: true,
      OR: [
        { normalizedName: { contains: normalizedQuery } },
        { normalizedName: { contains: looseQuery } },
        { keywords: { has: normalizedQuery } },
        { keywords: { has: looseQuery } },
        { synonyms: { has: normalizedQuery } },
        { synonyms: { has: looseQuery } },
      ],
    },
    take: CANDIDATES_LIMIT,
    select: {
      id: true,
      name: true,
      normalizedName: true,
      keywords: true,
      synonyms: true,
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
    },
  })

  const candidates: ServiceCandidate[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    normalizedName: r.normalizedName,
    categoryName: r.category.name,
    subcategoryName: r.subcategory.name,
    keywords: r.keywords,
    synonyms: r.synonyms,
  }))

  const ranked = rankServiceMatches(q, candidates).slice(0, MAX_RESULTS)
  // `type`/`displayShort` are additive fields only — every result here is a
  // CatalogService leaf (type: 'service'). Surfacing 'subcategory'/'category'
  // level matches (e.g. "plombier" -> "Voir tous les services de Plomberie")
  // is intentionally deferred: components/service-picker.tsx's
  // selectSearchResult() currently treats every result.id as a selectable
  // CatalogService id and POSTs it straight to /api/services/[id]/select, so
  // adding non-service result types here without also updating that
  // component would let a user "select" a subcategory/category id as if it
  // were a service.
  const results = ranked.map((r) => ({
    id: r.id,
    type: 'service' as const,
    name: r.name,
    categoryName: r.categoryName,
    subcategoryName: r.subcategoryName,
    displayShort: r.name,
    displayFull: `${r.name} · ${r.subcategoryName} · ${r.categoryName}`,
  }))
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } })
}
