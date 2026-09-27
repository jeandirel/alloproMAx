/**
 * Pure, DB-free ranking of Gabon location candidates (province / city /
 * neighborhood) against a free-text query. Used both by
 * app/api/locations/search/route.ts (after fetching a bounded candidate set
 * from Prisma) and by unit tests, since it never touches the network or a
 * database itself.
 *
 * Tolerant of case, accents, hyphens and extra whitespace via
 * normalizeLocationName(), and of small typos via a capped Levenshtein
 * distance check on short strings.
 *
 * Scoring tiers (highest to lowest): exact normalized match > name starts
 * with the query > a word within the name starts with the query > the
 * query appears anywhere in the name > a close typo match.
 */

import { normalizeLocationName } from '@/lib/location-normalize'

export type LocationType = 'province' | 'city' | 'neighborhood'

export interface LocationCandidate {
  id: string
  type: LocationType
  name: string
  normalizedName: string
  cityName?: string
  provinceName?: string
  /** Parent city id — present for 'neighborhood' candidates. */
  cityId?: string
  /** Parent province id — present for 'city' and 'neighborhood' candidates. */
  provinceId?: string
}

export interface RankedLocationMatch extends LocationCandidate {
  score: number
}

const SCORE_EXACT = 100
const SCORE_STARTS_WITH = 80
const SCORE_WORD_BOUNDARY = 60
const SCORE_SUBSTRING = 40
const SCORE_TYPO_BASE = 20
const TYPO_MAX_QUERY_LENGTH = 12
const TYPO_MAX_DISTANCE = 2

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Classic O(n*m) edit distance with a rolling two-row buffer.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

function scoreCandidate(normalizedQuery: string, normalizedName: string): number {
  if (!normalizedQuery) return 0
  if (normalizedName === normalizedQuery) return SCORE_EXACT
  if (normalizedName.startsWith(normalizedQuery)) return SCORE_STARTS_WITH
  const words = normalizedName.split(' ')
  if (words.some((w) => w.startsWith(normalizedQuery))) return SCORE_WORD_BOUNDARY
  if (normalizedName.includes(normalizedQuery)) return SCORE_SUBSTRING
  if (normalizedQuery.length <= TYPO_MAX_QUERY_LENGTH) {
    const distances = [levenshtein(normalizedQuery, normalizedName), ...words.map((w) => levenshtein(normalizedQuery, w))]
    const bestDistance = Math.min(...distances)
    if (bestDistance <= TYPO_MAX_DISTANCE && bestDistance > 0) return Math.max(1, SCORE_TYPO_BASE - bestDistance * 5)
  }
  return 0
}

/**
 * Scores and sorts candidates by relevance to a free-text query. Returns
 * only candidates with a positive score, sorted descending by score then
 * alphabetically by name. Pure function: no I/O, no mutation of inputs.
 */
export function rankLocationMatches<T extends LocationCandidate>(query: string, candidates: T[]): (T & { score: number })[] {
  const normalizedQuery = normalizeLocationName(query)
  if (!normalizedQuery) return []
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(normalizedQuery, c.normalizedName) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

// Retained for callers that want the raw regex-escaping helper (e.g. building
// a case/accent-insensitive `contains` filter elsewhere); not used above
// since word-boundary detection here is done via split() rather than regex.
export { escapeRegExp }
