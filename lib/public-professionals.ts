import { prisma } from '@/lib/prisma'
import type { Professional } from '@/lib/data'
import type { Prisma } from '@prisma/client'

// Fiches professionnelles réelles (issues de la base de données), pour la
// vitrine publique (accueil, recherche, fiche pro anonymes). Distinct du
// « Workspace » de démonstration (lib/marketplace.ts) utilisé par
// l'expérience connectée simulée.

export interface PublicProfessionalFilters {
  query?: string
  categoryId?: string
  provinceId?: string
  cityId?: string
  neighborhoodId?: string
  limit?: number
}

const professionalInclude = {
  user: { select: { name: true, phone: true } },
  category: { select: { name: true } },
  province: { select: { name: true } },
  city: { select: { name: true } },
  neighborhood: { select: { name: true } },
  services: { where: { active: true }, select: { name: true, price: true }, take: 12 },
  professionalServices: { select: { serviceId: true } },
  _count: { select: { reviews: true } },
  reviews: {
    where: { hidden: false },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      quality: true,
      punctuality: true,
      communication: true,
      comment: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  },
} as const

// Forme structurelle minimale requise par mapProfessional — satisfaite par
// les résultats de findMany() et findUnique() ci-dessous, sans dépendre des
// types génériques Prisma (fragiles à faire correspondre exactement).
interface ProfessionalRow {
  id: string
  headline: string | null
  bio: string | null
  zone: string | null
  zones: string[]
  cityId: string | null
  neighborhoodId: string | null
  ratingAvg: number
  responseRate: number | null
  avgReplyTime: string | null
  availability: string | null
  online: boolean
  priceFrom: number
  photo: string | null
  gallery: string[]
  kycStatus: string
  user: { name: string | null; phone: string | null } | null
  category: { name: string } | null
  province: { name: string } | null
  city: { name: string } | null
  neighborhood: { name: string } | null
  services: { name: string; price: number }[]
  professionalServices: { serviceId: string }[]
  _count: { reviews: number }
  reviews: {
    quality: number
    punctuality: number
    communication: number
    comment: string | null
    createdAt: Date
    author: { name: string | null } | null
  }[]
}

function mapProfessional(p: ProfessionalRow, missionsCount: number): Professional {
  const locationLabel = p.neighborhood?.name || p.city?.name || p.province?.name || p.zone || ''
  const ratingCount = p._count?.reviews ?? 0
  return {
    id: p.id,
    name: p.user?.name || 'Professionnel Allo Pro',
    metier: p.headline || p.category?.name || '',
    categorie: p.category?.name || '',
    zone: locationLabel,
    note: ratingCount > 0 ? Math.round(p.ratingAvg * 10) / 10 : 0,
    ratingCount,
    missions: missionsCount,
    tarifMin: p.priceFrom || 0,
    verifie: p.kycStatus === 'verifie',
    enLigne: p.online,
    photo: p.photo || '',
    bio: p.bio || '',
    phone: p.user?.phone || null,
    tauxReponse: p.responseRate ?? null,
    delaiMoyen: p.avgReplyTime ?? null,
    disponibilite: p.online ? 'Disponible maintenant' : (p.availability || 'Disponibilité à confirmer'),
    zones: p.zones?.length ? p.zones : (locationLabel ? [locationLabel] : []),
    services: (p.services || []).map((s) => ({ nom: s.name, tarif: s.price })),
    galerie: p.gallery || [],
    avis: (p.reviews || []).map((r) => ({
      nom: r.author?.name || 'Client Allo Pro',
      photo: '',
      note: Math.round((r.quality + r.punctuality + r.communication) / 3),
      date: r.createdAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
      commentaire: r.comment || '',
      quartier: '',
    })),
    cityId: p.cityId,
    neighborhoodId: p.neighborhoodId,
    neighborhoodIds: p.neighborhoodId ? [p.neighborhoodId] : [],
    serviceIds: (p.professionalServices || []).map((ps) => ps.serviceId),
  }
}

/** Nombre réel de missions terminées, en une seule requête groupée (évite un aller-retour par professionnel). */
async function loadMissionCounts(professionalIds: string[]): Promise<Map<string, number>> {
  if (!professionalIds.length) return new Map()
  const rows = await prisma.booking.groupBy({
    by: ['professionalId'],
    where: { professionalId: { in: professionalIds }, status: 'terminee' },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.professionalId, r._count._all]))
}

/**
 * Liste des professionnels réels visibles publiquement. Ne renvoie jamais de
 * profil fictif : en cas d'échec de connexion à la base (ex. hébergement DB
 * indisponible), renvoie une liste vide plutôt que de planter — l'appelant
 * doit alors afficher un état vide honnête, jamais des données de démo.
 */
export async function getPublicProfessionals(filters: PublicProfessionalFilters = {}): Promise<Professional[]> {
  const { query, categoryId, provinceId, cityId, neighborhoodId, limit = 60 } = filters
  try {
    const where: Prisma.ProfessionalWhereInput = {
      suspended: false,
      ...(categoryId ? { categoryId } : {}),
      ...(provinceId ? { provinceId } : {}),
      ...(cityId ? { cityId } : {}),
      ...(neighborhoodId ? { neighborhoodId } : {}),
      ...(query
        ? {
            OR: [
              { headline: { contains: query, mode: 'insensitive' } },
              { bio: { contains: query, mode: 'insensitive' } },
              { user: { name: { contains: query, mode: 'insensitive' } } },
              { category: { name: { contains: query, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const rows = await prisma.professional.findMany({
      where,
      take: limit,
      orderBy: [{ ratingAvg: 'desc' }, { createdAt: 'desc' }],
      include: professionalInclude,
    })
    const missionCounts = await loadMissionCounts(rows.map((r) => r.id))
    return rows.map((r) => mapProfessional(r, missionCounts.get(r.id) ?? 0))
  } catch (error) {
    console.error('[public-professionals] requête liste indisponible, repli sur liste vide', error)
    return []
  }
}

/** Fiche professionnelle réelle par identifiant, ou `null` si absente/suspendue/base indisponible. */
export async function getPublicProfessionalById(id: string): Promise<Professional | null> {
  try {
    const p = await prisma.professional.findUnique({ where: { id }, include: professionalInclude })
    if (!p || p.suspended) return null
    const missionCounts = await loadMissionCounts([p.id])
    return mapProfessional(p, missionCounts.get(p.id) ?? 0)
  } catch (error) {
    console.error('[public-professionals] requête fiche indisponible', error)
    return null
  }
}
