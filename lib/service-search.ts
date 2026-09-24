/**
 * Pure, DB-free ranking of CatalogService candidates against a free-text
 * query. Used both by app/api/services/search/route.ts (after fetching a
 * bounded candidate set from Prisma) and by unit tests, since it never
 * touches the network or a database itself.
 *
 * Modeled on lib/location-search.ts (same scoring shape: exact > starts-with
 * > word-boundary > substring > typo), extended with a keyword/synonym
 * bonus tier since CatalogService rows carry `keywords`/`synonyms` arrays
 * that the plain name-based tiers don't see (e.g. "debouchage" should
 * surface "Fuite d'eau" via a keyword, not just literal substring match on
 * the name).
 */

import { normalizeServiceName, normalizeServiceNameLoose } from '@/lib/service-normalize'

export interface ServiceCandidate {
  id: string
  name: string
  normalizedName: string
  categoryName?: string
  subcategoryName?: string
  keywords?: string[]
  synonyms?: string[]
}

export interface RankedServiceMatch extends ServiceCandidate {
  score: number
}

const SCORE_EXACT = 100
const SCORE_STARTS_WITH = 80
const SCORE_WORD_BOUNDARY = 60
const SCORE_SUBSTRING = 40
const SCORE_KEYWORD_MATCH = 30
const SCORE_TYPO_BASE = 20
const TYPO_MAX_QUERY_LENGTH = 12
const TYPO_MAX_DISTANCE = 2

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

function scoreCandidate(normalizedQuery: string, looseQuery: string, candidate: ServiceCandidate): number {
  if (!normalizedQuery) return 0
  const normalizedName = candidate.normalizedName
  if (normalizedName === normalizedQuery) return SCORE_EXACT
  if (normalizedName.startsWith(normalizedQuery)) return SCORE_STARTS_WITH
  const words = normalizedName.split(' ')
  if (words.some((w) => w.startsWith(normalizedQuery))) return SCORE_WORD_BOUNDARY
  if (normalizedName.includes(normalizedQuery)) return SCORE_SUBSTRING
  // Loose (plural-stripped) match against the name itself.
  if (normalizedName === looseQuery || normalizeServiceNameLoose(normalizedName) === normalizedQuery) return SCORE_SUBSTRING

  const keywordsAndSynonyms = [...(candidate.keywords ?? []), ...(candidate.synonyms ?? [])]
  if (keywordsAndSynonyms.some((k) => k === normalizedQuery || k === looseQuery || k.includes(normalizedQuery))) {
    return SCORE_KEYWORD_MATCH
  }

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
export function rankServiceMatches<T extends ServiceCandidate>(query: string, candidates: T[]): (T & { score: number })[] {
  const normalizedQuery = normalizeServiceName(query)
  if (!normalizedQuery) return []
  const looseQuery = normalizeServiceNameLoose(query)
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(normalizedQuery, looseQuery, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}
