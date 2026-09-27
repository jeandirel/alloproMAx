/**
 * Canonical normalization helpers for the services catalogue
 * (Category / ServiceSubcategory / CatalogService names).
 *
 * Deliberately separate from lib/location-normalize.ts (different domain,
 * different callers) but built on the same base approach, so the two stay
 * easy to compare and audit side by side:
 *
 *   NFD-normalize -> strip diacritics -> lowercase -> replace
 *   apostrophes/hyphens/underscores with spaces -> collapse whitespace -> trim
 *
 * These are the single source of truth used both to populate the
 * `normalizedName` columns at write time (see scripts/import-catalogue.ts,
 * the ServiceSuggestion API routes) and to look up existing rows via
 * indexed equality (upsert `where` clauses, e.g.
 * `Category.normalizedName`-style lookups, `ServiceSubcategory.categoryId_normalizedName`,
 * `CatalogService.subcategoryId_normalizedName`).
 */

function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/**
 * Normalizes a service/category/subcategory name for case/diacritic/
 * punctuation-insensitive comparison and storage in `normalizedName` columns.
 *
 * Steps: NFD-normalize -> strip diacritics -> lowercase -> replace
 * apostrophes/hyphens/underscores with spaces -> collapse whitespace -> trim.
 *
 * This is the STRICT variant: it does not touch plurals. Use this for all
 * `normalizedName` columns (uniqueness must stay stable and predictable).
 */
export function normalizeServiceName(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/['’_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Same normalization as normalizeServiceName(), but returns a URL-safe slug
 * (spaces replaced with hyphens) for use in `slug` columns and routes.
 */
export function slugifyService(input: string): string {
  return normalizeServiceName(input).replace(/\s+/g, '-')
}

/**
 * Loose, best-effort variant of normalizeServiceName() for fuzzy/duplicate
 * matching only (e.g. suggestion de-duplication, "did you mean" search) —
 * NEVER for `normalizedName` columns or unique lookups, since it is lossy
 * and not guaranteed collision-free.
 *
 * On top of normalizeServiceName(), applies a simple heuristic plural-strip:
 * if the normalized string ends in "s", is longer than 4 characters, and
 * does not end in a double "s" (e.g. "gaz", "bus" false positives are rare
 * in French service names but a trailing "ss" is excluded defensively),
 * strip a single trailing "s". This intentionally only handles the common
 * French regular plural (e.g. "tables" -> "table", "chaises" -> "chaise")
 * and will occasionally under- or over-strip on irregular words — that is
 * acceptable for loose matching, not for canonical storage.
 */
export function normalizeServiceNameLoose(input: string): string {
  const strict = normalizeServiceName(input)
  if (strict.length > 4 && strict.endsWith('s') && !strict.endsWith('ss')) {
    return strict.slice(0, -1)
  }
  return strict
}
