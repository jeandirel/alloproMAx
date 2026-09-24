import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { professionals, categories } from '../lib/data'
import { importLocations } from './import-locations'
import { importCatalogue } from './import-catalogue'

const prisma = new PrismaClient()

async function main() {
  // Hidden test account
  const testPwHash = await bcrypt.hash('FvOzdjZ*8S', 12)
  await prisma.user.upsert({
    where: { email: 'abacus-51f44a48@example.com' },
    update: {},
    create: {
      email: 'abacus-51f44a48@example.com',
      password: testPwHash,
      name: 'Test Admin',
      role: 'admin',
    },
  })

  // Demo user: Armand Ndong
  const demoPwHash = await bcrypt.hash('demo1234', 12)
  await prisma.user.upsert({
    where: { email: 'armand@allopro.ga' },
    update: {},
    create: {
      email: 'armand@allopro.ga',
      password: demoPwHash,
      name: 'Armand Ndong',
      role: 'user',
    },
  })

  // Catalogue relationnel : categories fixes
  const categoryByName = new Map<string, string>()
  for (const [index, cat] of categories.entries()) {
    const row = await prisma.category.upsert({
      where: { slug: cat.id },
      update: { name: cat.nom, icon: cat.icon, active: true, position: index },
      create: { slug: cat.id, name: cat.nom, icon: cat.icon, active: true, position: index },
    })
    categoryByName.set(cat.nom, row.id)
  }

  // Catalogue relationnel : professionnels fictifs (lib/data.ts) + compte User placeholder
  for (const pro of professionals) {
    const categoryId = categoryByName.get(pro.categorie)
    if (!categoryId) {
      console.warn(`Categorie introuvable pour ${pro.name} (${pro.categorie}), professionnel ignore.`)
      continue
    }

    const email = `pro-${pro.id}@seed.allopro.invalid`
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: pro.name, role: 'professional' },
    })

    const professionalData = {
      categoryId,
      headline: pro.metier,
      bio: pro.bio,
      zone: pro.zone,
      zones: pro.zones,
      ratingAvg: pro.note,
      ratingCount: pro.avis.length,
      responseRate: pro.tauxReponse,
      avgReplyTime: pro.delaiMoyen,
      availability: pro.disponibilite,
      online: pro.enLigne,
      priceFrom: pro.tarifMin,
      photo: pro.photo,
      gallery: pro.galerie,
      kycStatus: pro.verifie ? 'verifie' : 'brouillon',
      suspended: false,
    }

    const professional = await prisma.professional.upsert({
      where: { userId: user.id },
      update: professionalData,
      create: { id: pro.id, userId: user.id, ...professionalData },
    })

    for (const service of pro.services) {
      await prisma.service.upsert({
        where: { professionalId_name: { professionalId: professional.id, name: service.nom } },
        update: { price: service.tarif, categoryId },
        create: { professionalId: professional.id, categoryId, name: service.nom, price: service.tarif },
      })
    }
  }

  // Configuration plateforme par defaut
  await prisma.platformSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, commission: 12, autoHours: 48 },
  })

  // Gabon Province/City/Neighborhood catalogue (see scripts/import-locations.ts).
  // Idempotent upserts — safe to run on every seed, including re-seeds of an
  // already-populated database. Without this, GET /api/locations/provinces
  // and the LocationPicker's cascading selects/search box start out (and, on
  // a fresh deploy, stay) empty.
  const locationsSummary = await importLocations(prisma)
  console.log(
    `Locations Gabon: ${locationsSummary.provinceCount} provinces, ${locationsSummary.cityCount} villes, ${locationsSummary.neighborhoodCount} quartiers upserted.`
  )

  // Services catalogue (Category -> ServiceSubcategory -> CatalogService), see
  // scripts/import-catalogue.ts. Run after the fixed categories above so it
  // can upsert against already-seeded Category rows without touching their
  // icon/position/active flags.
  const catalogueSummary = await importCatalogue(prisma)
  console.log(
    `Catalogue services: ${catalogueSummary.categoryCount} categories, ${catalogueSummary.subcategoryCount} sous-categories, ${catalogueSummary.serviceCount} services upserted.`
  )

  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
