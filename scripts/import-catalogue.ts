import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { normalizeServiceName, slugifyService } from '../lib/service-normalize'

type ServiceEntry = {
  name: string
  keywords?: string[]
  synonyms?: string[]
}

type SubcategoryEntry = {
  subcategory: string
  description?: string
  services: ServiceEntry[]
}

type CategoryEntry = {
  category: string
  subcategories: SubcategoryEntry[]
}

type ServicesCatalogueFile = {
  categories: CategoryEntry[]
}

export interface ImportCatalogueSummary {
  categoryCount: number
  subcategoryCount: number
  serviceCount: number
}

// Idempotent, upsert-only import of prisma/seed-data/services-catalogue.json
// into the Category -> ServiceSubcategory -> CatalogService taxonomy. Safe to
// re-run: every write is an upsert keyed on the normalized name (or the
// compound unique index), so re-running this script never creates duplicate
// rows and never deletes data.
//
// NOTE ON MODEL NAMES: this repo's pre-existing `Service` model is an
// individual professional's paid listing (professionalId + price, referenced
// by Booking) — NOT a taxonomy leaf. To avoid colliding with it, the
// taxonomy leaf populated here is the separate `CatalogService` model (see
// prisma/schema.prisma, "CATALOGUE DE SERVICES" section).
//
// Exported (rather than only run as a standalone script) so scripts/seed.ts
// can invoke it as part of the standard `prisma db seed` pipeline, after the
// fixed Category rows it seeds — see the upsert comment below. Shares the
// caller's PrismaClient instance/connection.
export async function importCatalogue(prisma: PrismaClient): Promise<ImportCatalogueSummary> {
  const dataPath = path.resolve(process.cwd(), 'prisma/seed-data/services-catalogue.json')
  const raw = fs.readFileSync(dataPath, 'utf-8')
  const data: ServicesCatalogueFile = JSON.parse(raw)

  let categoryCount = 0
  let subcategoryCount = 0
  let serviceCount = 0

  for (const [index, cat] of data.categories.entries()) {
    const categoryNormalized = normalizeServiceName(cat.category)
    const categorySlug = slugifyService(cat.category)

    // Category is reused from the existing marketplace catalogue (slug is its
    // pre-existing unique key). We only touch name/icon/position on create —
    // an existing Category row (e.g. seeded via scripts/seed.ts) keeps its
    // current icon/position/active flag untouched on update.
    const category = await prisma.category.upsert({
      where: { slug: categorySlug },
      update: { name: cat.category },
      create: { slug: categorySlug, name: cat.category, position: index, active: true },
    })
    categoryCount++

    for (const [subIndex, sub] of cat.subcategories.entries()) {
      const subNormalized = normalizeServiceName(sub.subcategory)
      const subSlug = slugifyService(sub.subcategory)

      const subcategory = await prisma.serviceSubcategory.upsert({
        where: { categoryId_normalizedName: { categoryId: category.id, normalizedName: subNormalized } },
        update: {
          name: sub.subcategory,
          slug: subSlug,
          description: sub.description ?? null,
          sortOrder: subIndex,
        },
        create: {
          categoryId: category.id,
          name: sub.subcategory,
          slug: subSlug,
          normalizedName: subNormalized,
          description: sub.description ?? null,
          sortOrder: subIndex,
        },
      })
      subcategoryCount++

      for (const [svcIndex, svc] of sub.services.entries()) {
        const svcNormalized = normalizeServiceName(svc.name)
        const svcSlug = slugifyService(svc.name)
        const keywords = svc.keywords ?? []
        const synonyms = svc.synonyms ?? []

        await prisma.catalogService.upsert({
          where: { subcategoryId_normalizedName: { subcategoryId: subcategory.id, normalizedName: svcNormalized } },
          update: {
            name: svc.name,
            slug: svcSlug,
            categoryId: category.id,
            keywords,
            synonyms,
            sortOrder: svcIndex,
          },
          create: {
            categoryId: category.id,
            subcategoryId: subcategory.id,
            name: svc.name,
            slug: svcSlug,
            normalizedName: svcNormalized,
            keywords,
            synonyms,
            sortOrder: svcIndex,
          },
        })
        serviceCount++
      }
    }
  }

  return { categoryCount, subcategoryCount, serviceCount }
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const { categoryCount, subcategoryCount, serviceCount } = await importCatalogue(prisma)
    console.log('Services catalogue import completed successfully!')
    console.log(`Summary: ${categoryCount} categories, ${subcategoryCount} subcategories, ${serviceCount} catalog services upserted.`)
  } finally {
    await prisma.$disconnect()
  }
}

// Only auto-run when this file is executed directly (e.g. `tsx
// scripts/import-catalogue.ts`), not when imported by scripts/seed.ts.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
