import assert from 'node:assert/strict'
import { z } from 'zod'
import { normalizeServiceName, normalizeServiceNameLoose, slugifyService } from '../lib/service-normalize'
import { rankServiceMatches, type ServiceCandidate } from '../lib/service-search'

// ---------------------------------------------------------------------------
// normalizeServiceName / slugifyService (lib/service-normalize.ts)
// ---------------------------------------------------------------------------

// Case, hyphen and whitespace variants of the same service name must all
// normalize identically — this is what de-duplication (unique
// `normalizedName` columns / upsert `where` clauses in
// scripts/import-catalogue.ts and app/api/service-suggestions/route.ts)
// depends on.
assert.equal(normalizeServiceName('Débouchage canalisation'), normalizeServiceName('debouchage canalisation'))
assert.equal(normalizeServiceName('debouchage canalisation'), normalizeServiceName('DEBOUCHAGE-CANALISATION'))
assert.equal(normalizeServiceName('Débouchage canalisation'), 'debouchage canalisation')

// Accents/diacritics are stripped.
assert.equal(normalizeServiceName('Électricité'), normalizeServiceName('Electricite'))
assert.equal(normalizeServiceName('Électricité'), 'electricite')

// Apostrophes and hyphens are folded to spaces (then whitespace-collapsed).
assert.equal(normalizeServiceName("Plomberie - Fuite d'eau"), 'plomberie fuite d eau')
assert.equal(normalizeServiceName('Plomberie   Fuite d’eau'), 'plomberie fuite d eau')

// Extra internal/leading/trailing whitespace collapses.
assert.equal(normalizeServiceName('  Peinture   intérieure  '), 'peinture interieure')

// slugifyService() is normalizeServiceName() with spaces folded to hyphens,
// so the same case/hyphen/whitespace/accent variants also produce the same
// slug.
assert.equal(slugifyService('Débouchage canalisation'), 'debouchage-canalisation')
assert.equal(slugifyService('DEBOUCHAGE-CANALISATION'), 'debouchage-canalisation')
assert.equal(slugifyService('  Peinture   intérieure  '), 'peinture-interieure')

// normalizeServiceNameLoose() additionally strips a simple trailing "s"
// (regular French plural) on top of the strict normalization, for
// fuzzy/duplicate matching only.
assert.equal(normalizeServiceNameLoose('Tables'), 'table')
assert.equal(normalizeServiceNameLoose('Chaises'), 'chaise')
// Short strings (<=4 chars normalized) are left alone even if they end in "s".
assert.equal(normalizeServiceNameLoose('Gaz'), 'gaz')
// A trailing double "s" is left alone (defensive, avoids over-stripping).
assert.equal(normalizeServiceNameLoose('Class'), 'class')

console.log('normalizeServiceName / slugifyService / normalizeServiceNameLoose : PASS')

// ---------------------------------------------------------------------------
// rankServiceMatches (lib/service-search.ts) — pure, DB-free ranking.
// ---------------------------------------------------------------------------

const candidates: ServiceCandidate[] = [
  {
    id: 'svc-debouchage',
    name: 'Débouchage canalisation',
    normalizedName: normalizeServiceName('Débouchage canalisation'),
    categoryName: 'Plomberie',
    subcategoryName: 'Canalisations',
    keywords: ['wc bouche', 'toilette bouchee', 'evier bouche'],
    synonyms: ['degorgement'],
  },
  {
    id: 'svc-peinture',
    name: 'Peinture intérieure',
    normalizedName: normalizeServiceName('Peinture intérieure'),
    categoryName: 'Bâtiment',
    subcategoryName: 'Peinture',
    keywords: ['peinture murs'],
  },
  {
    id: 'svc-clim',
    name: 'Climatisation',
    normalizedName: normalizeServiceName('Climatisation'),
    categoryName: 'Électroménager',
    subcategoryName: 'Climatisation',
  },
]

// A colloquial query naming the symptom ("wc bouche" = "toilettes bouchées")
// should surface the "Débouchage canalisation" service near the top via its
// keywords array, even though the query shares no substring with the
// service's own name.
const wcMatches = rankServiceMatches('wc bouche', candidates)
assert.ok(wcMatches.length > 0, 'expected at least one match for "wc bouche"')
assert.equal(wcMatches[0].id, 'svc-debouchage', '"wc bouche" should rank "Débouchage canalisation" first (via keyword match)')

// Exact (accent/case-insensitive) name match ranks first for its own query.
const climMatches = rankServiceMatches('climatisation', candidates)
assert.ok(climMatches.length > 0, 'expected at least one match for "climatisation"')
assert.equal(climMatches[0].id, 'svc-clim', 'exact-name query should rank the matching candidate first')

// A nonsense query, far (edit-distance-wise) from every candidate name/word
// and every keyword/synonym, must not produce a false-positive match.
const nonsenseMatches = rankServiceMatches('zzqqxx', candidates)
assert.equal(nonsenseMatches.length, 0, 'a nonsense query should not match any candidate')

console.log('rankServiceMatches : PASS')

// ---------------------------------------------------------------------------
// POST /api/service-suggestions body schema
// (app/api/service-suggestions/route.ts — confirmed canonical, wired-and-
// -called route per the backend consolidation pass; app/api/services/
// suggestions/route.ts and app/api/admin/services/suggestions*/route.ts were
// the dead-code duplicates and have been deleted).
//
// Re-declared here (rather than imported from the route file) to keep this
// test free of the route's module-scope dependencies (@/auth, @/lib/prisma,
// @/lib/rate-limit — none of which are needed to validate schema shape, and
// some of which construct a PrismaClient / NextAuth instance at import
// time). This mirrors the exact `bodySchema` exported from that route file;
// if the two ever diverge, that is a route-file change to review, not a
// reason to import server-only modules into a DB-free script.
// ---------------------------------------------------------------------------

const serviceSuggestionBodySchema = z.object({
  proposedName: z.string().trim().min(2).max(80),
  categoryId: z.string().min(1).optional(),
  subcategoryId: z.string().min(1).optional(),
  description: z.string().trim().max(500).optional(),
  submitterEmail: z.string().email().optional(),
})

// A valid payload parses.
assert.doesNotThrow(() =>
  serviceSuggestionBodySchema.parse({
    proposedName: 'Réparation climatiseur split',
    categoryId: 'cat-1',
    subcategoryId: 'sub-1',
    description: 'Pas de froid, compresseur bruyant',
  })
)

// A payload missing a required field (proposedName) throws.
assert.throws(() => serviceSuggestionBodySchema.parse({ categoryId: 'cat-1' }), z.ZodError)

// An overly long proposedName (>80 chars) throws.
assert.throws(
  () => serviceSuggestionBodySchema.parse({ proposedName: 'A'.repeat(81) }),
  z.ZodError
)

console.log('POST /api/service-suggestions body schema : PASS')

// ---------------------------------------------------------------------------
// Explicitly SKIPPED — require a live database connection (the hosted
// Postgres is confirmed unreachable this session):
// - POST /api/service-suggestions end-to-end (creating a real pending row,
//   the "exists"/"already_pending" short-circuit branches against real
//   CatalogService/ServiceSuggestion rows).
// - POST /api/admin/service-suggestions/[id]/approve making a suggestion
//   into a real CatalogService row.
// - POST /api/admin/service-suggestions/[id]/reject keeping it rejected.
// - POST /api/services/[id]/select incrementing a real searchCount.
// - GET /api/services/{categories,subcategories,catalog,search} against a
//   real seeded catalogue (category/subcategory/service tree, search
//   candidate fetch feeding rankServiceMatches).
// - A real 403 response for a non-admin HTTP call against the admin routes.
// These require integration testing against a live Postgres instance and
// cannot be exercised as pure/deterministic unit tests.
// ---------------------------------------------------------------------------

console.log('CATALOGUE DE SERVICES : PASS — normalisation, recherche classée, schéma de suggestion.')
