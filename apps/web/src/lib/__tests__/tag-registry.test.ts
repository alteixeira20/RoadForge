import { describe, it, expect } from 'vitest'
import {
  buildRegistryFromPhases,
  buildTagId,
  ensureRegistryForTagIds,
  mergeTagRegistries,
  mergeTagRegistriesWithConflicts,
  normalizeTagColor,
  resolveTagDisplay,
  uniqueTagId,
} from '@/lib/tag-registry'
import type { Phase, TagDefinition } from '@/types/roadmap'

function makePhase(tags: string[]): Phase {
  return {
    id: `ph-${Math.random()}`,
    num: '01',
    name: 'Phase',
    color: '#888',
    status: 'active',
    progress: 0,
    tasks: [{ id: `t-${Math.random()}`, title: 'T', done: false, tags }],
  }
}

describe('buildRegistryFromPhases', () => {
  it('returns empty array for empty phases', () => {
    expect(buildRegistryFromPhases([])).toEqual([])
  })

  it('creates one entry per unique tag', () => {
    const phases = [makePhase(['infra', 'design']), makePhase(['design', 'backend'])]
    const registry = buildRegistryFromPhases(phases)
    expect(registry).toHaveLength(3)
    expect(registry.map((t) => t.id)).toEqual(['infra', 'design', 'backend'])
  })

  it('uses tag string as both id and label', () => {
    const [entry] = buildRegistryFromPhases([makePhase(['my-tag'])])
    expect(entry.id).toBe('my-tag')
    expect(entry.label).toBe('my-tag')
  })

  it('deduplicates across phases', () => {
    const phases = [makePhase(['tag-a']), makePhase(['tag-a'])]
    expect(buildRegistryFromPhases(phases)).toHaveLength(1)
  })
})

describe('resolveTagDisplay', () => {
  const registry: TagDefinition[] = [
    { id: 'infra', label: 'Infrastructure', color: '#7c3aed' },
    { id: 'design', label: 'Design' },
  ]

  it('returns label and color from registry', () => {
    expect(resolveTagDisplay('infra', registry)).toEqual({ label: 'Infrastructure', color: '#7c3aed' })
  })

  it('returns label without color for registry entry without color', () => {
    expect(resolveTagDisplay('design', registry)).toEqual({ label: 'Design', color: undefined })
  })

  it('falls back to raw string when tag not in registry', () => {
    expect(resolveTagDisplay('unknown-tag', registry)).toEqual({ label: 'unknown-tag' })
  })

  it('falls back gracefully with empty registry', () => {
    expect(resolveTagDisplay('foo', [])).toEqual({ label: 'foo' })
  })
})

describe('mergeTagRegistries', () => {
  const current: TagDefinition[] = [
    { id: 'infra', label: 'Infrastructure', color: '#7c3aed' },
  ]
  const incoming: TagDefinition[] = [
    { id: 'infra', label: 'Different Label' }, // should NOT overwrite
    { id: 'design', label: 'Design' },          // should be added
  ]

  it('preserves existing tags and adds new ones', () => {
    const merged = mergeTagRegistries(current, incoming)
    expect(merged).toHaveLength(2)
    const infra = merged.find((t) => t.id === 'infra')
    expect(infra?.label).toBe('Infrastructure') // not overwritten
    expect(infra?.color).toBe('#7c3aed')
    expect(merged.find((t) => t.id === 'design')?.label).toBe('Design')
  })

  it('returns current unchanged when incoming is empty', () => {
    expect(mergeTagRegistries(current, [])).toEqual(current)
  })

  it('returns incoming when current is empty', () => {
    expect(mergeTagRegistries([], incoming)).toEqual(incoming)
  })

  it('handles identical registries', () => {
    const merged = mergeTagRegistries(current, current)
    expect(merged).toHaveLength(1)
  })

  it('reports same-id metadata conflicts without overwriting current', () => {
    const result = mergeTagRegistriesWithConflicts(current, [{
      id: 'infra',
      label: 'Platform',
      color: '#ff0000',
    }])

    expect(result.registry).toEqual(current)
    expect(result.conflicts[0].type).toBe('tag-registry-conflict')
  })

  it('reports normalized-label conflicts across different ids', () => {
    const result = mergeTagRegistriesWithConflicts(current, [{
      id: 'infra-two',
      label: '  infrastructure  ',
    }])

    expect(result.registry).toEqual(current)
    expect(result.conflicts[0].fieldDiffs?.[0]).toEqual({
      field: 'id',
      current: 'infra',
      imported: 'infra-two',
    })
  })
})

describe('tag normalization', () => {
  it('builds a bounded kebab-case id', () => {
    expect(buildTagId('  API & Platform Work  ')).toBe('api-platform-work')
  })

  it('creates a bounded unique suffix', () => {
    expect(uniqueTagId('infra', [{ id: 'infra', label: 'Infra' }])).toBe('infra-2')
  })

  it('accepts only six-digit hex colors', () => {
    expect(normalizeTagColor('#AABBCC')).toBe('#aabbcc')
    expect(normalizeTagColor('red')).toBeUndefined()
  })

  it('adds fallback definitions for unknown task tag ids', () => {
    expect(ensureRegistryForTagIds(['infra'], [])).toEqual([
      { id: 'infra', label: 'infra' },
    ])
  })
})
