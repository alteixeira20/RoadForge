import { describe, it, expect } from 'vitest'
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
    it('accepts a minimal valid fixture with one phase and no tasks', () => {
      const input = JSON.stringify({
        schema: 'anvilary.roadmap.export',
        version: 1,
        phases: [MINIMAL_PHASE],
      })
      const result = parseImportedRoadmapJson(input)
      expect(result.phases).toHaveLength(1)
      expect(result.phases[0].id).toBe('p1')
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
