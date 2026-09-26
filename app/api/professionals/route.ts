import { NextRequest, NextResponse } from 'next/server'
import { getPublicProfessionals } from '@/lib/public-professionals'

// Listing public des professionnels réels (aucune authentification requise).
// Toujours 200 avec `professionals: []` si la base est indisponible ou vide —
// jamais de profil fictif en repli.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const professionals = await getPublicProfessionals({
    query: params.get('q')?.trim() || undefined,
    categoryId: params.get('categoryId')?.trim() || undefined,
    provinceId: params.get('provinceId')?.trim() || undefined,
    cityId: params.get('cityId')?.trim() || undefined,
    neighborhoodId: params.get('neighborhoodId')?.trim() || undefined,
    limit: Math.min(Number(params.get('limit')) || 60, 120),
  })
  return NextResponse.json({ professionals })
}
