export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { normalizeLocationName } from '@/lib/location-normalize'
import { rankLocationMatches, type LocationCandidate } from '@/lib/location-search'

const MAX_QUERY_LENGTH = 80
const CANDIDATES_PER_TABLE = 50
const MAX_RESULTS = 15

const querySchema = z.object({ q: z.string().trim().min(1).max(MAX_QUERY_LENGTH) })

export async function GET(req: Request) {
  const parsed = querySchema.safeParse({ q: new URL(req.url).searchParams.get('q') || '' })
  if (!parsed.success) return NextResponse.json({ error: 'q requis.' }, { status: 400 })
  const { q } = parsed.data
  const normalizedQuery = normalizeLocationName(q)
  // Bounded candidate sets only — never the full table (800+ neighborhoods).
  const [provinces, cities, neighborhoods] = await Promise.all([
    prisma.province.findMany({ where: { isActive: true, normalizedName: { contains: normalizedQuery } }, take: CANDIDATES_PER_TABLE, select: { id: true, name: true, normalizedName: true } }),
    prisma.city.findMany({ where: { isActive: true, normalizedName: { contains: normalizedQuery } }, take: CANDIDATES_PER_TABLE, select: { id: true, name: true, normalizedName: true, provinceId: true, province: { select: { name: true } } } }),
    prisma.neighborhood.findMany({ where: { isActive: true, normalizedName: { contains: normalizedQuery } }, take: CANDIDATES_PER_TABLE, select: { id: true, name: true, normalizedName: true, cityId: true, city: { select: { name: true, provinceId: true, province: { select: { name: true } } } } } }),
  ])
  const candidates: LocationCandidate[] = [
    ...provinces.map((p) => ({ id: p.id, type: 'province' as const, name: p.name, normalizedName: p.normalizedName })),
    ...cities.map((c) => ({ id: c.id, type: 'city' as const, name: c.name, normalizedName: c.normalizedName, provinceName: c.province.name, provinceId: c.provinceId })),
    ...neighborhoods.map((n) => ({ id: n.id, type: 'neighborhood' as const, name: n.name, normalizedName: n.normalizedName, cityName: n.city.name, provinceName: n.city.province.name, cityId: n.cityId, provinceId: n.city.provinceId })),
  ]
  const ranked = rankLocationMatches(q, candidates).slice(0, MAX_RESULTS)
  const results = ranked.map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    cityName: r.cityName ?? null,
    provinceName: r.provinceName ?? null,
    // Parent ids so a search-selected result can seed the same relational
    // provinceId/cityId chain a cascading-select pick would (see
    // components/location-picker.tsx selectSearchResult()).
    cityId: r.cityId ?? null,
    provinceId: r.provinceId ?? null,
    displayShort: r.name,
    displayFull:
      r.type === 'neighborhood' ? `${r.name} / ${r.cityName} · ${r.provinceName} · Gabon`
      : r.type === 'city' ? `${r.name} · ${r.provinceName} · Gabon`
      : `${r.name} · Gabon`,
  }))
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } })
}
