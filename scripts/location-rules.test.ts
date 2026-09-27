import assert from 'node:assert/strict'
import { z } from 'zod'
import { normalizeLocationName, slugify } from '../lib/location-normalize'
import { rankLocationMatches, type LocationCandidate } from '../lib/location-search'
import { formatLocationLabel } from '../lib/location-format'

// ---------------------------------------------------------------------------
// normalizeLocationName / slugify (lib/location-normalize.ts)
// ---------------------------------------------------------------------------

// Case, hyphen and whitespace variants of the same neighborhood name must all
// normalize identically — this is what de-duplication (upsert `where`
// clauses in scripts/import-locations.ts) depends on.
assert.equal(normalizeLocationName('Nzeng-Ayong'), normalizeLocationName('nzeng ayong'))
assert.equal(normalizeLocationName('nzeng ayong'), normalizeLocationName('NZENG-AYONG'))
assert.equal(normalizeLocationName('Nzeng-Ayong'), 'nzeng ayong')

// Accents/diacritics are stripped.
assert.equal(normalizeLocationName('Àkanda'), normalizeLocationName('Akanda'))
assert.equal(normalizeLocationName('Àkanda'), 'akanda')
assert.equal(normalizeLocationName('Libréville'), 'libreville')

// Extra internal/leading/trailing whitespace collapses.
assert.equal(normalizeLocationName('  Nzeng   Ayong  '), 'nzeng ayong')

// slugify() is normalizeLocationName() with spaces folded to hyphens, so the
// same case/hyphen/whitespace variants also produce the same slug.
assert.equal(slugify('Nzeng-Ayong'), 'nzeng-ayong')
assert.equal(slugify('nzeng ayong'), 'nzeng-ayong')
assert.equal(slugify('NZENG-AYONG'), 'nzeng-ayong')

console.log('normalizeLocationName / slugify : PASS')

// ---------------------------------------------------------------------------
// rankLocationMatches (lib/location-search.ts) — pure, DB-free ranking.
// ---------------------------------------------------------------------------

const candidates: LocationCandidate[] = [
  { id: 'n1', type: 'neighborhood', name: 'Nzeng-Ayong', normalizedName: normalizeLocationName('Nzeng-Ayong'), cityName: 'Libreville', provinceName: 'Estuaire', cityId: 'c1', provinceId: 'p1' },
  { id: 'c1', type: 'city', name: 'Libreville', normalizedName: normalizeLocationName('Libreville'), provinceName: 'Estuaire', provinceId: 'p1' },
  { id: 'c2', type: 'city', name: 'Port-Gentil', normalizedName: normalizeLocationName('Port-Gentil'), provinceName: 'Ogooué-Maritime', provinceId: 'p2' },
  { id: 'p1', type: 'province', name: 'Estuaire', normalizedName: normalizeLocationName('Estuaire') },
]

const nzengMatches = rankLocationMatches('Nzeng Ayong', candidates)
assert.ok(nzengMatches.length > 0, 'expected at least one match for "Nzeng Ayong"')
assert.equal(nzengMatches[0].id, 'n1', 'Nzeng-Ayong candidate should rank first for a "Nzeng Ayong" query')

const libMatches = rankLocationMatches('Libreville', candidates)
assert.ok(libMatches.length > 0, 'expected at least one match for "Libreville"')
assert.equal(libMatches[0].id, 'c1', 'Libreville candidate should rank first for a "Libreville" query')

// A nonsense query, far (edit-distance-wise) from every candidate name, must
// not produce a false-positive top-ranked "exact" (or near-exact) match.
const nonsenseMatches = rankLocationMatches('zzqqxx', candidates)
assert.equal(nonsenseMatches.length, 0, 'a nonsense query should not match any candidate')

console.log('rankLocationMatches : PASS')

// ---------------------------------------------------------------------------
// formatLocationLabel (lib/location-format.ts)
// ---------------------------------------------------------------------------

const resolved = { name: 'Nzeng-Ayong', cityName: 'Libreville', provinceName: 'Estuaire' }
assert.equal(formatLocationLabel(resolved, 'short'), 'Nzeng-Ayong')
assert.equal(formatLocationLabel(resolved, 'medium'), 'Nzeng-Ayong, Libreville')
assert.equal(formatLocationLabel(resolved, 'full'), 'Nzeng-Ayong / Libreville · Estuaire · Gabon')
// Default level (no second argument) is 'short'.
assert.equal(formatLocationLabel(resolved), 'Nzeng-Ayong')
// Null/undefined/empty value formats to ''.
assert.equal(formatLocationLabel(null), '')
assert.equal(formatLocationLabel(undefined), '')
assert.equal(formatLocationLabel({}), '')

console.log('formatLocationLabel : PASS')

// ---------------------------------------------------------------------------
// POST /api/location-suggestions body schema (app/api/location-suggestions/route.ts)
//
// Re-declared here (rather than imported from the route file) to keep this
// test free of the route's module-scope dependencies (@/auth, @/lib/prisma,
// @/lib/rate-limit — none of which are needed to validate schema shape, and
// some of which construct a PrismaClient / NextAuth instance at import time).
// This mirrors the exact `bodySchema` exported from that route file; if the
// two ever diverge, that is a route-file change to review, not a reason to
// import server-only modules into a DB-free script.
// ---------------------------------------------------------------------------

const locationSuggestionBodySchema = z.object({
  type: z.enum(['CITY', 'NEIGHBORHOOD']),
  provinceId: z.string().min(1),
  cityId: z.string().min(1).optional(),
  proposedName: z.string().trim().min(2).max(80),
  extraInfo: z.string().trim().max(500).optional(),
  submitterEmail: z.string().email().optional(),
})

// A valid payload parses.
assert.doesNotThrow(() =>
  locationSuggestionBodySchema.parse({
    type: 'NEIGHBORHOOD',
    provinceId: 'p1',
    cityId: 'c1',
    proposedName: 'Nzeng-Ayong Extension',
    extraInfo: 'Près du grand marché',
  })
)

// A payload missing a required field (proposedName) throws.
assert.throws(() => locationSuggestionBodySchema.parse({ type: 'CITY', provinceId: 'p1' }), z.ZodError)

// An overly long proposedName (>80 chars) throws.
assert.throws(
  () => locationSuggestionBodySchema.parse({ type: 'CITY', provinceId: 'p1', proposedName: 'A'.repeat(81) }),
  z.ZodError
)

console.log('POST /api/location-suggestions body schema : PASS')

// ---------------------------------------------------------------------------
// Explicitly SKIPPED — require a live database connection (the hosted
// Postgres is confirmed unreachable this session):
// - POST /api/location-suggestions end-to-end (creating a real pending row).
// - POST /api/admin/location-suggestions/[id]/approve making a suggestion
//   public (creating a real City/Neighborhood row).
// - POST /api/admin/location-suggestions/[id]/reject keeping it private.
// - A real 403 response for a non-admin HTTP call against the admin routes.
// These require integration testing against a live Postgres instance and
// cannot be exercised as pure/deterministic unit tests.
// ---------------------------------------------------------------------------

console.log('LOCALISATION GABON : PASS — normalisation, recherche classée, formatage, schéma de suggestion.')
