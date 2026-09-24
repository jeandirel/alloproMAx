import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { normalizeLocationName, slugify } from '../lib/location-normalize'

type VilleEntry = {
  ville: string
  quartiers?: string[]
  source?: string
}

type ProvinceEntry = {
  province: string
  villes: VilleEntry[]
}

type GabonLocationsFile = {
  provinces: ProvinceEntry[]
}

export interface ImportLocationsSummary {
  provinceCount: number
  cityCount: number
  neighborhoodCount: number
}

// Idempotent, upsert-only import of prisma/seed-data/gabon-locations.json into
// the Province/City/Neighborhood catalogue. Safe to re-run: every write is an
// upsert keyed on the normalized name (or the compound unique index), so
// re-running this script never creates duplicate rows and never deletes data.
//
// Exported (rather than only run as a standalone script) so scripts/seed.ts
// can invoke it as part of the standard `prisma db seed` pipeline, sharing
// the caller's PrismaClient instance/connection.
export async function importLocations(prisma: PrismaClient): Promise<ImportLocationsSummary> {
  const dataPath = path.resolve(process.cwd(), 'prisma/seed-data/gabon-locations.json')
  const raw = fs.readFileSync(dataPath, 'utf-8')
  const data: GabonLocationsFile = JSON.parse(raw)

  let provinceCount = 0
  let cityCount = 0
  let neighborhoodCount = 0

  for (const p of data.provinces) {
    const provinceNormalized = normalizeLocationName(p.province)

    const province = await prisma.province.upsert({
      where: { normalizedName: provinceNormalized },
      update: { name: p.province, slug: slugify(p.province) },
      create: {
        name: p.province,
        slug: slugify(p.province),
        normalizedName: provinceNormalized,
        countryCode: 'GA',
      },
    })
    provinceCount++

    for (const v of p.villes) {
      const cityNormalized = normalizeLocationName(v.ville)

      const city = await prisma.city.upsert({
        where: {
          provinceId_normalizedName: {
            provinceId: province.id,
            normalizedName: cityNormalized,
          },
        },
        update: {
          name: v.ville,
          slug: slugify(v.ville),
          source: v.source ?? null,
        },
        create: {
          provinceId: province.id,
          name: v.ville,
          slug: slugify(v.ville),
          normalizedName: cityNormalized,
          source: v.source ?? null,
        },
      })
      cityCount++

      const quartiers = v.quartiers ?? []
      for (const q of quartiers) {
        if (!q || !q.trim()) continue

        const neighborhoodNormalized = normalizeLocationName(q)

        await prisma.neighborhood.upsert({
          where: {
            cityId_normalizedName: {
              cityId: city.id,
              normalizedName: neighborhoodNormalized,
            },
          },
          update: {
            name: q,
            slug: slugify(q),
          },
          create: {
            cityId: city.id,
            name: q,
            slug: slugify(q),
            normalizedName: neighborhoodNormalized,
          },
        })
        neighborhoodCount++
      }
    }
  }

  return { provinceCount, cityCount, neighborhoodCount }
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const { provinceCount, cityCount, neighborhoodCount } = await importLocations(prisma)
    console.log('Gabon locations import completed successfully!')
    console.log(`Summary: ${provinceCount} provinces, ${cityCount} cities, ${neighborhoodCount} neighborhoods upserted.`)
  } finally {
    await prisma.$disconnect()
  }
}

// Only auto-run when this file is executed directly (e.g. `tsx
// scripts/import-locations.ts`), not when imported by scripts/seed.ts.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
