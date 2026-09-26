// Pilotage financier administrateur (Phase 8) : reglages globaux, overrides de commission par
// categorie/sous-categorie, consultation du grand livre et des versements. Ecrit uniquement
// MarketplaceSettings/Category/ServiceSubcategory — ne touche jamais un OfferSnapshot deja fige
// (voir lib/marketplace/pricing.ts) : une modification ici ne s'applique qu'aux prochaines
// negociations, jamais retroactivement (MarketplaceSettings.version trace ce qui a change et quand).
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { BPS_DENOMINATOR } from './pricing'

type Tx = Prisma.TransactionClient

function assertBpsOrNull(value: number | null | undefined, label: string): void {
  if (value === null || value === undefined) return
  if (!Number.isSafeInteger(value) || value < 0 || value > BPS_DENOMINATOR) {
    throw new Error(`${label} doit être un entier entre 0 et ${BPS_DENOMINATOR} (reçu : ${value}).`)
  }
}

// Accepte un client transactionnel optionnel : à l'intérieur d'une transaction verrouillée (voir
// updateMarketplaceSettings), l'écriture doit passer par le même client `tx` que le verrou, jamais
// par le client `prisma` global (sinon la lecture/écriture échappe au verrou de ligne).
async function auditFinance(params: { adminId: string; action: string; targetType: string; targetId: string; metadata?: Prisma.InputJsonValue }, client: Tx | typeof prisma = prisma) {
  const actorExists = await client.user.findUnique({ where: { id: params.adminId }, select: { id: true } })
  await client.auditLog.create({
    data: {
      actorId: actorExists ? params.adminId : null,
      actorRole: 'administrateur',
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata ?? {},
    },
  })
}

export type MarketplaceSettingsPatch = {
  platformCommissionBps?: number
  contactUnlockFeeAmount?: number
  autoCompleteHours?: number
}

// Modification des reglages globaux — version incrementee a chaque appel (tracabilite uniquement,
// voir prisma/schema.prisma). Verrouillage explicite : ligne unique (id=1), forte contention possible
// si plusieurs administrateurs modifient en meme temps.
export async function updateMarketplaceSettings(adminId: string, patch: MarketplaceSettingsPatch) {
  if (Object.keys(patch).length === 0) throw new Error('Aucun changement fourni.')
  assertBpsOrNull(patch.platformCommissionBps, 'platformCommissionBps')
  if (patch.contactUnlockFeeAmount !== undefined && (!Number.isSafeInteger(patch.contactUnlockFeeAmount) || patch.contactUnlockFeeAmount < 0)) {
    throw new Error('contactUnlockFeeAmount doit être un entier positif ou nul.')
  }
  if (patch.autoCompleteHours !== undefined && (!Number.isSafeInteger(patch.autoCompleteHours) || patch.autoCompleteHours <= 0)) {
    throw new Error('autoCompleteHours doit être un entier strictement positif.')
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "MarketplaceSettings" WHERE id = 1 FOR UPDATE`
    const current = await tx.marketplaceSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } })
    const updated = await tx.marketplaceSettings.update({
      where: { id: 1 },
      data: { ...patch, version: { increment: 1 }, updatedById: adminId },
    })
    await auditFinance(
      {
        adminId,
        action: 'marketplace.settings.updated',
        targetType: 'MarketplaceSettings',
        targetId: '1',
        metadata: { previous: patch.platformCommissionBps !== undefined ? { platformCommissionBps: current.platformCommissionBps } : undefined, patch, version: updated.version },
      },
      tx,
    )
    return updated
  }, { maxWait: 5000, timeout: 10000 })
}

// Override de commission par categorie/sous-categorie — priorite sous-categorie > categorie >
// global (voir lib/marketplace/pricing.ts::resolveCommissionBps). `null` efface l'override (retour
// a l'heritage) : c'est une valeur legitime, distincte de "non fourni".
export async function setCommissionOverride(adminId: string, targetType: 'category' | 'subcategory', targetId: string, commissionBpsOverride: number | null) {
  assertBpsOrNull(commissionBpsOverride, 'commissionBpsOverride')
  const updated =
    targetType === 'category'
      ? await prisma.category.update({ where: { id: targetId }, data: { commissionBpsOverride } })
      : await prisma.serviceSubcategory.update({ where: { id: targetId }, data: { commissionBpsOverride } })
  await auditFinance({
    adminId,
    action: 'marketplace.commission_override.updated',
    targetType: targetType === 'category' ? 'Category' : 'ServiceSubcategory',
    targetId,
    metadata: { commissionBpsOverride },
  })
  return updated
}

// Consultation du grand livre — jamais de mutation ici (append-only, voir prisma/schema.prisma).
export async function listLedgerEntries(params: { type?: string; bookingId?: string; take?: number; cursor?: string } = {}) {
  const take = Math.min(Math.max(params.take ?? 50, 1), 200)
  return prisma.ledgerEntry.findMany({
    where: { type: params.type, bookingId: params.bookingId },
    orderBy: { createdAt: 'desc' },
    take,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })
}

// Consultation des versements — par defaut les seuls actionnables (a_verser/echoue) ; passer
// status: 'all' pour l'historique complet, ou un statut precis pour filtrer dessus uniquement.
export async function listPayoutsForAdmin(params: { status?: 'a_verser' | 'echoue' | 'verse' | 'all' } = {}) {
  const where =
    params.status === undefined
      ? { status: { in: ['a_verser', 'echoue'] } }
      : params.status === 'all'
        ? {}
        : { status: params.status }
  return prisma.payout.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { booking: true },
  })
}
