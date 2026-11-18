import {
  isCredentialLikeFieldName,
  parseTaskExternalLinkUrl,
} from '@/lib/github-links'
import type { TaskExternalLink } from '@/types/roadmap'

// ─── Low-level guards (shared with roadmap-validation.ts) ─────────────────────

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertNoUnsafeKeys(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (UNSAFE_KEYS.has(key)) throw new Error(`Unsafe key "${key}" in import`)
  }
}

// ─── Task-link validation ─────────────────────────────────────────────────────

const TASK_LINKS_MAX = 20
const TASK_LINK_KEYS = new Set([
  'id', 'provider', 'kind', 'url', 'owner', 'repo', 'number', 'sha', 'tag', 'label',
])

function normalizeLinkRecord(value: unknown): TaskExternalLink | null {
  if (!isPlainObject(value)) return null
  assertNoUnsafeKeys(value)
  if (Object.keys(value).some(isCredentialLikeFieldName)) return null
  if (
    typeof value.id !== 'string'
    || typeof value.url !== 'string'
    || typeof value.provider !== 'string'
    || typeof value.kind !== 'string'
    || (value.label !== undefined && typeof value.label !== 'string')
  ) {
    return null
  }

  const result = parseTaskExternalLinkUrl(value.url, value.id, value.label)
  if (!result.ok) return null
  if (result.link.provider !== value.provider || result.link.kind !== value.kind) {
    return null
  }
  return result.link
}

function linkRecordMatches(
  raw: Record<string, unknown>,
  normalized: TaskExternalLink,
): boolean {
  const normalizedEntries = Object.entries(normalized)
  return Object.keys(raw).length === normalizedEntries.length
    && normalizedEntries.every(([key, value]) => raw[key] === value)
}

export function normalizeTaskLinks(value: unknown[]): {
  links: TaskExternalLink[]
  repaired: boolean
} {
  const links: TaskExternalLink[] = []
  const ids = new Set<string>()
  const urls = new Set<string>()
  let repaired = value.length > TASK_LINKS_MAX

  for (const raw of value.slice(0, TASK_LINKS_MAX)) {
    const link = normalizeLinkRecord(raw)
    if (!link || ids.has(link.id) || urls.has(link.url)) {
      repaired = true
      continue
    }
    if (
      !isPlainObject(raw)
      || Object.keys(raw).some((key) => !TASK_LINK_KEYS.has(key))
      || !linkRecordMatches(raw, link)
    ) {
      repaired = true
    }
    links.push(link)
    ids.add(link.id)
    urls.add(link.url)
  }
  return { links, repaired }
}

export function validateTaskLinks(value: unknown): TaskExternalLink[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) throw new Error('task.links must be an array')
  if (value.length > TASK_LINKS_MAX) {
    throw new Error(`task.links exceeds ${TASK_LINKS_MAX} items`)
  }
  const normalized = normalizeTaskLinks(value)
  if (normalized.repaired) throw new Error('task.links contains an invalid link')
  return normalized.links
}
