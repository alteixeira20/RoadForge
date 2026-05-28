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
        schema: 'roadforge.roadmap.export',
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
  })
})
