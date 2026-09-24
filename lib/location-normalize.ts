/**
 * Canonical normalization helpers for Gabon geographic location names
 * (Province / City / Neighborhood).
 *
 * These are the single source of truth used both to populate the
 * `normalizedName` columns at write time (see scripts/import-locations.ts)
 * and to look up existing rows via indexed equality (upsert `where`
 * clauses, e.g. `Province.normalizedName`, `City.provinceId_normalizedName`,
 * `Neighborhood.cityId_normalizedName`). Because de-duplication depends on
 * it, normalizeLocationName() must be deterministic and go further than the
 * lightweight `normalize()` helper in app/recherche/recherche-client.tsx
 * (NFD + diacritic strip + lowercase only, used only for in-memory text
 * search): here apostrophes, hyphens and underscores are also folded to
 * spaces and whitespace is collapsed, so that "Nzeng-Ayong", "nzeng ayong"
 * and "NZENG-AYONG" all normalize to the exact same string.
 */

function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/**
 * Normalizes a location name for case/diacritic/punctuation-insensitive
 * comparison and storage in `normalizedName` columns.
 *
 * Steps: NFD-normalize -> strip diacritics -> lowercase -> replace
 * apostrophes/hyphens/underscores with spaces -> collapse whitespace -> trim.
 */
export function normalizeLocationName(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/['’_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Same normalization as normalizeLocationName(), but returns a URL-safe
 * slug (spaces replaced with hyphens) for use in `slug` columns and routes.
 */
export function slugify(input: string): string {
  return normalizeLocationName(input).replace(/\s+/g, '-')
}
