import type { Phase, TagDefinition } from '@/types/roadmap'
import type { ImportConflict } from '@/lib/import-merge/conflict-types'

export const TAG_ID_MAX = 40
export const TAG_LABEL_MAX = 80
export const TAG_REGISTRY_MAX = 200
export const TAG_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const TAG_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function normalizeTagLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').slice(0, TAG_LABEL_MAX)
}

export function buildTagId(label: string): string {
  return normalizeTagLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TAG_ID_MAX)
    .replace(/-+$/g, '')
}

export function uniqueTagId(base: string, registry: TagDefinition[]): string {
  if (!registry.some((tag) => tag.id === base)) return base
  let suffix = 2
  while (suffix < 10_000) {
    const suffixText = `-${suffix}`
    const candidate = `${base.slice(0, TAG_ID_MAX - suffixText.length)}${suffixText}`
    if (!registry.some((tag) => tag.id === candidate)) return candidate
    suffix++
  }
  throw new Error('Could not generate a unique tag ID')
}

export function normalizeTagColor(color?: string): string | undefined {
  if (!color) return undefined
  const normalized = color.trim().toLowerCase()
  return TAG_COLOR_PATTERN.test(normalized) ? normalized : undefined
}

export function normalizedTagLabelKey(label: string): string {
  return normalizeTagLabel(label).toLowerCase()
}

export function buildRegistryFromPhases(phases: Phase[]): TagDefinition[] {
  const seen = new Set<string>()
  const result: TagDefinition[] = []
  for (const phase of phases) {
    for (const task of phase.tasks) {
      for (const tag of task.tags ?? []) {
        if (!seen.has(tag)) {
          seen.add(tag)
          result.push({ id: tag, label: tag })
        }
      }
    }
  }
  return result
}

export function ensureRegistryForTagIds(
  tagIds: string[],
  registry: TagDefinition[],
): TagDefinition[] {
  const next = [...registry]
  const knownIds = new Set(next.map((tag) => tag.id))
  for (const tagId of tagIds) {
    if (knownIds.has(tagId) || next.length >= TAG_REGISTRY_MAX) continue
    next.push({ id: tagId, label: tagId })
    knownIds.add(tagId)
  }
  return next
}

export function resolveTagDisplay(
  tagId: string,
  registry: TagDefinition[],
): { label: string; color?: string } {
  const entry = registry.find((t) => t.id === tagId)
  return entry ? { label: entry.label, color: entry.color } : { label: tagId }
}

const FALLBACK_TAG_COLORS: Record<string, string> = {
  infra: '#7c3aed',
  design: '#db2777',
  security: '#dc2626',
  backend: '#2563eb',
  frontend: '#0891b2',
  polish: '#ca8a04',
  subtask: '#4b5563',
}

export function fallbackTagColor(tagId: string): string {
  const normalized = tagId.toLowerCase().trim()
  if (FALLBACK_TAG_COLORS[normalized]) return FALLBACK_TAG_COLORS[normalized]
  const palette = ['#059669', '#d97706', '#4f46e5', '#9333ea', '#c026d3', '#e11d48']
  let hash = 0
  for (let index = 0; index < normalized.length; index++) {
    hash = normalized.charCodeAt(index) + ((hash << 5) - hash)
  }
  return palette[Math.abs(hash) % palette.length]
}

export function resolveTagColor(tagId: string, registry: TagDefinition[]): string {
  return resolveTagDisplay(tagId, registry).color ?? fallbackTagColor(tagId)
}

export function mergeTagRegistries(
  current: TagDefinition[],
  incoming: TagDefinition[],
): TagDefinition[] {
  return mergeTagRegistriesWithConflicts(current, incoming).registry
}

export function mergeTagRegistriesWithConflicts(
  current: TagDefinition[],
  incoming: TagDefinition[],
): { registry: TagDefinition[]; conflicts: ImportConflict[] } {
  const registry = [...current]
  const byId = new Map(registry.map((tag) => [tag.id, tag]))
  const byLabel = new Map(
    registry.map((tag) => [normalizedTagLabelKey(tag.label), tag]),
  )
  const conflicts: ImportConflict[] = []

  for (const tag of incoming) {
    const sameId = byId.get(tag.id)
    if (sameId) {
      if (
        normalizedTagLabelKey(sameId.label) !== normalizedTagLabelKey(tag.label) ||
        normalizeTagColor(sameId.color) !== normalizeTagColor(tag.color)
      ) {
        conflicts.push({
          type: 'tag-registry-conflict',
          kind: 'tag',
          importedId: tag.id,
          importedTitle: tag.label,
          currentId: sameId.id,
          message: `Tag "${tag.id}" has different label or color metadata — current definition preserved.`,
          fieldDiffs: [
            { field: 'label', current: sameId.label, imported: tag.label },
            {
              field: 'color',
              current: sameId.color ?? '—',
              imported: tag.color ?? '—',
            },
          ],
        })
      }
      continue
    }

    const sameLabel = byLabel.get(normalizedTagLabelKey(tag.label))
    if (sameLabel) {
      conflicts.push({
        type: 'tag-registry-conflict',
        kind: 'tag',
        importedId: tag.id,
        importedTitle: tag.label,
        currentId: sameLabel.id,
        message: `Tag label "${tag.label}" already belongs to "${sameLabel.id}" — current definition preserved.`,
        fieldDiffs: [{
          field: 'id',
          current: sameLabel.id,
          imported: tag.id,
        }],
      })
      continue
    }

    if (registry.length >= TAG_REGISTRY_MAX) break
    registry.push(tag)
    byId.set(tag.id, tag)
    byLabel.set(normalizedTagLabelKey(tag.label), tag)
  }
  return { registry, conflicts }
}
