import { prisma } from '../prisma'
import { resolveCommissionBps } from './pricing'

const SETTINGS_ID = 1

// Cree la ligne unique au premier appel (valeurs par defaut du schema) — jamais de valeur inventee
// ici : les defauts vivent uniquement dans prisma/schema.prisma, cette fonction ne fait que lire.
export async function getMarketplaceSettings() {
  return prisma.marketplaceSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  })
}

// Resout la commission applicable a une categorie/sous-categorie donnee, en respectant la priorite
// sous-categorie > categorie > reglage global (voir lib/marketplace/pricing.ts::resolveCommissionBps).
export async function resolveCommissionBpsFor(params: { categoryId: string; subcategoryId?: string | null }) {
  const [settings, category, subcategory] = await Promise.all([
    getMarketplaceSettings(),
    prisma.category.findUniqueOrThrow({ where: { id: params.categoryId }, select: { commissionBpsOverride: true } }),
    params.subcategoryId
      ? prisma.serviceSubcategory.findUniqueOrThrow({
          where: { id: params.subcategoryId },
          select: { commissionBpsOverride: true },
        })
      : Promise.resolve(null),
  ])
  return {
    commissionBps: resolveCommissionBps({
      globalBps: settings.platformCommissionBps,
      categoryOverrideBps: category.commissionBpsOverride,
      subcategoryOverrideBps: subcategory?.commissionBpsOverride,
    }),
    settingsVersion: settings.version,
    currency: settings.currency,
  }
}
