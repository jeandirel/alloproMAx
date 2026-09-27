/**
 * Pure formatting helpers for displaying a resolved Gabon location (a
 * province-, city-, or neighborhood-level match) at different levels of
 * detail. Shared by `components/location-picker.tsx` (trigger label,
 * search results) and by any page that renders an already-stored/resolved
 * location — e.g. a professional's profile page.
 *
 * The input shape intentionally mirrors what `GET /api/locations/search`
 * already returns, so a search result object can be passed straight
 * through without remapping:
 * - `name`: the resolved location's own name — a neighborhood name, or (if
 *   there is no neighborhood) a city name, or (if there is no city
 *   either) a province name. In other words: the most specific name
 *   available.
 * - `cityName`: the parent city's name. Present only when `name` refers to
 *   a neighborhood; null/undefined otherwise.
 * - `provinceName`: the parent province's name. Present when `name` refers
 *   to a neighborhood or a city; null/undefined for a bare province-level
 *   value.
 */
export interface LocationNameParts {
  name?: string | null
  cityName?: string | null
  provinceName?: string | null
}

export type LocationDisplayLevel = 'short' | 'medium' | 'full'

/**
 * Formats a resolved location into a user-facing label at the requested
 * level of detail.
 *
 * - `short`: just the most specific name, e.g. "Nzeng-Ayong".
 * - `medium`: neighborhood + city, e.g. "Nzeng-Ayong, Libreville" — falls
 *   back to just the name when there is no neighborhood/city pair to show.
 * - `full`: full breadcrumb with country, e.g.
 *   "Nzeng-Ayong / Libreville · Estuaire · Gabon".
 *
 * Returns '' for a null/undefined/empty value.
 */
export function formatLocationLabel(
  value: LocationNameParts | null | undefined,
  level: LocationDisplayLevel = 'short'
): string {
  const name = value?.name?.trim() || ''
  const cityName = value?.cityName?.trim() || ''
  const provinceName = value?.provinceName?.trim() || ''
  if (!name && !cityName && !provinceName) return ''

  if (level === 'short') {
    return name || cityName || provinceName
  }

  if (level === 'medium') {
    if (name && cityName) return `${name}, ${cityName}`
    return name || cityName || provinceName
  }

  // level === 'full'
  if (name && cityName) return `${name} / ${cityName}${provinceName ? ` · ${provinceName}` : ''} · Gabon`
  if (name && provinceName) return `${name} · ${provinceName} · Gabon`
  if (name) return `${name} · Gabon`
  if (cityName) return `${cityName}${provinceName ? ` · ${provinceName}` : ''} · Gabon`
  return provinceName ? `${provinceName} · Gabon` : ''
}
