import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AI_ROADMAP_TEMPLATE } from '@/lib/ai-roadmap-template'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'

const MINIMAL_TASK = {
  id: 't1',
  title: 'First task',
  done: false,
}

const MINIMAL_PHASE = {
  id: 'p1',
  num: '01',
  name: 'Phase One',
  color: '#808080',
  status: 'active',
  progress: 0,
  tasks: [],
}

describe('roadmap-validation', () => {
  describe('parseImportedRoadmapJson', () => {
    it.each([
      'anvilary.roadmap.import',
      'anvilary.roadmap.export',
      'roadforge.roadmap.import',
      'roadforge.roadmap.export',
    ])('accepts known schema %s without a schema warning', (schema) => {
      const result = parseImportedRoadmapJson(JSON.stringify({
        schema,
        version: 1,
        phases: [],
      }))

      expect(result.warnings.map((warning) => warning.code)).not.toContain(
        'schema_unknown',
      )
    })

    it('continues to warn for an unknown schema', () => {
      const result = parseImportedRoadmapJson(JSON.stringify({
        schema: 'roadforge.roadmap.v0',
        version: 1,
        phases: [],
      }))

      expect(result.warnings.map((warning) => warning.code)).toContain(
        'schema_unknown',
      )
    })

    it('accepts the AI template example without warnings or repairs', () => {
      const example = AI_ROADMAP_TEMPLATE.match(/```json\n([\s\S]*?)\n```/)
      expect(example?.[1]).toBeDefined()

      const result = parseImportedRoadmapJson(example![1])

      expect(result.warnings).toEqual([])
      expect(result.repairs).toEqual([])
    })

    it('keeps the downloadable and documented AI templates identical', () => {
      const documentedTemplate = readFileSync(
        new URL('../../../../../docs/roadforge-ai-roadmap-template.txt', import.meta.url),
        'utf8',
      )

      expect(AI_ROADMAP_TEMPLATE).toBe(documentedTemplate)
    })

    it.each([
      '../../../../../docs/roadforge-roadmap.json',
      '../../../../../examples/public-alpha-demo-roadmap.json',
    ])('accepts tracked roadmap example %s', (relativePath) => {
      const input = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
      const result = parseImportedRoadmapJson(input)

      expect(result.warnings).toEqual([])
      expect(result.repairs).toEqual([])
    })

    it('accepts a minimal valid fixture with one phase and no tasks', () => {
      const input = JSON.stringify({
        schema: 'anvilary.roadmap.export',
        version: 1,
        phases: [MINIMAL_PHASE],
      })
      const result = parseImportedRoadmapJson(input)
      expect(result.phases).toHaveLength(1)
      expect(result.phases[0].id).toBe('p1')
      expect(result.phases[0].colorMode).toBe('auto')
    })

    it('preserves Markdown descriptions as strings', () => {
      const desc = 'Intro with **bold**.\\n\\n- [ ] Follow up'
      const phase = { ...MINIMAL_PHASE, tasks: [{ ...MINIMAL_TASK, desc }] }
      const result = parseImportedRoadmapJson(JSON.stringify({ phases: [phase] }))

      expect(result.phases[0].tasks[0].desc).toBe(desc)
    })

    it('accepts a task description at the 5000-character import limit', () => {
      const desc = 'x'.repeat(5_000)
      const phase = { ...MINIMAL_PHASE, tasks: [{ ...MINIMAL_TASK, desc }] }
      const result = parseImportedRoadmapJson(JSON.stringify({ phases: [phase] }))

      expect(result.phases[0].tasks[0].desc).toBe(desc)
    })

    it('rejects a task description over the import limit', () => {
      const desc = 'x'.repeat(5_001)
      const phase = { ...MINIMAL_PHASE, tasks: [{ ...MINIMAL_TASK, desc }] }

      expect(() => parseImportedRoadmapJson(JSON.stringify({ phases: [phase] })))
        .toThrow('Import failed: task.desc exceeds 5000 characters')
    })

    it('accepts an empty phases array', () => {
      const input = JSON.stringify({ phases: [] })
      const result = parseImportedRoadmapJson(input)
      expect(result.phases).toEqual([])
    })

    it('accepts a phases array with a task', () => {
      const phase = { ...MINIMAL_PHASE, tasks: [MINIMAL_TASK] }
      const input = JSON.stringify({ phases: [phase] })
      const result = parseImportedRoadmapJson(input)
      expect(result.phases[0].tasks).toHaveLength(1)
      expect(result.phases[0].tasks[0].id).toBe('t1')
    })

    it('preserves normalized GitHub and generic task links', () => {
      const links = [
        {
          id: 'issue',
          provider: 'github',
          kind: 'issue',
          url: 'https://github.com/anvilary/roadforge/issues/601',
          owner: 'anvilary',
          repo: 'roadforge',
          number: 601,
        },
        {
          id: 'pull',
          provider: 'github',
          kind: 'pull',
          url: 'https://github.com/anvilary/roadforge/pull/602',
          owner: 'anvilary',
          repo: 'roadforge',
          number: 602,
        },
        {
          id: 'discussion',
          provider: 'github',
          kind: 'discussion',
          url: 'https://github.com/anvilary/roadforge/discussions/603',
          owner: 'anvilary',
          repo: 'roadforge',
          number: 603,
        },
        {
          id: 'commit',
          provider: 'github',
          kind: 'commit',
          url: 'https://github.com/anvilary/roadforge/commit/abcdef0123456789',
          owner: 'anvilary',
          repo: 'roadforge',
          sha: 'abcdef0123456789',
        },
        {
          id: 'release',
          provider: 'github',
          kind: 'release',
          url: 'https://github.com/anvilary/roadforge/releases/tag/v1.2.3',
          owner: 'anvilary',
          repo: 'roadforge',
          tag: 'v1.2.3',
        },
        {
          id: 'spec',
          provider: 'url',
          kind: 'url',
          url: 'https://example.com/spec',
          label: 'Specification',
        },
      ]
      const phase = {
        ...MINIMAL_PHASE,
        colorMode: 'auto',
        tasks: [{ ...MINIMAL_TASK, links }],
      }

      const result = parseImportedRoadmapJson(JSON.stringify({ phases: [phase] }))

      expect(result.phases[0].tasks[0].links).toEqual(links)
      expect(result.repairs).toEqual([])
      expect(result.warnings.map((warning) => warning.code)).not.toContain('unknown_fields')
    })

    it.each([
      { field: 'provider', value: 'gitlab' },
      { field: 'kind', value: 'branch' },
      { field: 'url', value: 'not-a-url' },
    ])('discards a link with invalid $field and reports a repair', ({ field, value }) => {
      const link = {
        id: 'bad-link',
        provider: 'github',
        kind: 'issue',
        url: 'https://github.com/anvilary/roadforge/issues/601',
        owner: 'anvilary',
        repo: 'roadforge',
        number: 601,
        [field]: value,
      }
      const phase = { ...MINIMAL_PHASE, tasks: [{ ...MINIMAL_TASK, links: [link] }] }

      const result = parseImportedRoadmapJson(JSON.stringify({ phases: [phase] }))

      expect(result.phases[0].tasks[0].links).toEqual([])
      expect(result.repairs.map((repair) => repair.code)).toContain('task_links_repaired')
    })

    it('preserves an explicitly empty links array and accepts a missing property', () => {
      const tasks = [{ ...MINIMAL_TASK, links: [] }, { ...MINIMAL_TASK, id: 't2' }]
      const phase = { ...MINIMAL_PHASE, colorMode: 'auto', tasks }

      const result = parseImportedRoadmapJson(JSON.stringify({ phases: [phase] }))

      expect(result.phases[0].tasks[0].links).toEqual([])
      expect(result.phases[0].tasks[1].links).toBeUndefined()
      expect(result.repairs).toEqual([])
    })

    it('removes credential-shaped links and strips query and fragment data', () => {
      const links = [
        {
          id: 'credential-query',
          provider: 'url',
          kind: 'url',
          url: 'https://example.com/work?access_token=redacted',
        },
        {
          id: 'safe-query',
          provider: 'url',
          kind: 'url',
          url: 'https://example.com/spec?view=compact#details',
        },
      ]
      const phase = { ...MINIMAL_PHASE, tasks: [{ ...MINIMAL_TASK, links }] }

      const result = parseImportedRoadmapJson(JSON.stringify({ phases: [phase] }))

      expect(result.phases[0].tasks[0].links).toEqual([{
        id: 'safe-query',
        provider: 'url',
        kind: 'url',
        url: 'https://example.com/spec',
      }])
      expect(result.repairs.map((repair) => repair.code)).toContain('task_links_repaired')
    })

    it('keeps the first duplicate link id or normalized URL', () => {
      const links = [
        { id: 'first', provider: 'url', kind: 'url', url: 'https://example.com/spec' },
        { id: 'first', provider: 'url', kind: 'url', url: 'https://example.com/other' },
        { id: 'third', provider: 'url', kind: 'url', url: 'https://example.com/spec/' },
      ]
      const phase = { ...MINIMAL_PHASE, tasks: [{ ...MINIMAL_TASK, links }] }

      const result = parseImportedRoadmapJson(JSON.stringify({ phases: [phase] }))

      expect(result.phases[0].tasks[0].links).toEqual([links[0]])
      expect(result.repairs.map((repair) => repair.code)).toContain('task_links_repaired')
    })

    it('extracts roadmapName from roadmap.name when present', () => {
      const input = JSON.stringify({
        phases: [],
        roadmap: { name: 'My Roadmap' },
      })
      const result = parseImportedRoadmapJson(input)
      expect(result.roadmapName).toBe('My Roadmap')
    })

    it('handles missing name field without throwing (roadmapName is optional)', () => {
      const input = JSON.stringify({ phases: [MINIMAL_PHASE] })
      const result = parseImportedRoadmapJson(input)
      expect(result.roadmapName).toBeUndefined()
    })

    it('throws when input is invalid JSON', () => {
      expect(() => parseImportedRoadmapJson('{not json')).toThrow(
        'Import failed: invalid JSON.',
      )
    })

    it('throws when top-level value is a number (not object or array)', () => {
      expect(() => parseImportedRoadmapJson('42')).toThrow('Import failed:')
    })

    it('throws when top-level value is a string (not object or array)', () => {
      expect(() => parseImportedRoadmapJson('"hello"')).toThrow('Import failed:')
    })

    it('returns repairs list when repair pipeline fires', () => {
      const phaseWithBadProgress = {
        ...MINIMAL_PHASE,
        progress: 'not-a-number',
        tasks: [{ id: 't1', title: 'A', done: true }],
      }
      const input = JSON.stringify({ phases: [phaseWithBadProgress] })
      const result = parseImportedRoadmapJson(input)
      // progress was invalid → repair recalculated it
      const repairCodes = result.repairs.map((r) => r.code)
      expect(repairCodes).toContain('progress_recalculated')
    })

    it('renames duplicate phase IDs to be unique', () => {
      const input = JSON.stringify({
        phases: [
          { ...MINIMAL_PHASE, id: 'dup' },
          { ...MINIMAL_PHASE, id: 'dup' },
        ],
      })
      const result = parseImportedRoadmapJson(input)
      const ids = result.phases.map((p) => p.id)
      expect(new Set(ids).size).toBe(2)
      expect(result.repairs.map((r) => r.code)).toContain('duplicate_phase_ids')
    })

    it('removes deps referencing tasks that do not exist', () => {
      const task = { ...MINIMAL_TASK, deps: ['missing-task', 't1'] }
      const input = JSON.stringify({ phases: [{ ...MINIMAL_PHASE, tasks: [task] }] })
      const result = parseImportedRoadmapJson(input)
      expect(result.phases[0].tasks[0].deps).toEqual(['t1'])
      expect(result.repairs.map((r) => r.code)).toContain('stale_deps_removed')
    })

    it('preserves valid claim fields on tasks', () => {
      const task = {
        ...MINIMAL_TASK,
        claimedBy: 'Alice',
        claimedById: 'p_abc123',
        claimedAt: '2026-06-01T10:00:00.000Z',
      }
      const input = JSON.stringify({ phases: [{ ...MINIMAL_PHASE, tasks: [task] }] })
      const result = parseImportedRoadmapJson(input)
      const t = result.phases[0].tasks[0]
      expect(t.claimedBy).toBe('Alice')
      expect(t.claimedById).toBe('p_abc123')
      expect(t.claimedAt).toBe('2026-06-01T10:00:00.000Z')
    })

    it('drops claimedAt when value is not a valid ISO timestamp', () => {
      const task = { ...MINIMAL_TASK, claimedAt: 'not-a-date' }
      const input = JSON.stringify({ phases: [{ ...MINIMAL_PHASE, tasks: [task] }] })
      const result = parseImportedRoadmapJson(input)
      expect(result.phases[0].tasks[0].claimedAt).toBeUndefined()
    })

    it('drops claimedBy and claimedById when null', () => {
      const task = { ...MINIMAL_TASK, claimedBy: null, claimedById: null }
      const input = JSON.stringify({ phases: [{ ...MINIMAL_PHASE, tasks: [task] }] })
      const result = parseImportedRoadmapJson(input)
      const t = result.phases[0].tasks[0]
      expect(t.claimedBy).toBeUndefined()
      expect(t.claimedById).toBeUndefined()
    })

    it('does not emit unknown_fields warning for claim fields', () => {
      const task = {
        ...MINIMAL_TASK,
        claimedBy: 'Alice',
        claimedById: 'p_abc',
        claimedAt: '2026-06-01T10:00:00Z',
      }
      const input = JSON.stringify({
        schema: 'anvilary.roadmap.export',
        version: 1,
        phases: [{ ...MINIMAL_PHASE, tasks: [task] }],
      })
      const result = parseImportedRoadmapJson(input)
      const warningCodes = result.warnings.map((w) => w.code)
      expect(warningCodes).not.toContain('unknown_fields')
    })

    it('preserves an explicitly empty tag registry', () => {
      const result = parseImportedRoadmapJson(JSON.stringify({
        phases: [],
        tagRegistry: [],
      }))

      expect(result.tagRegistry).toEqual([])
    })

    it('repairs invalid and duplicate tag registry definitions', () => {
      const result = parseImportedRoadmapJson(JSON.stringify({
        phases: [],
        tagRegistry: [
          { id: 'infra', label: 'Infrastructure', color: '#AABBCC' },
          { id: 'infra-copy', label: ' infrastructure ' },
          { id: 'Invalid ID', label: 'Invalid' },
          { id: 'design', label: 'Design', color: 'red' },
        ],
      }))

      expect(result.tagRegistry).toEqual([
        { id: 'infra', label: 'Infrastructure', color: '#aabbcc' },
        { id: 'design', label: 'Design' },
      ])
      expect(result.repairs.map((repair) => repair.code)).toContain(
        'tag_registry_repaired',
      )
    })
  })
})
