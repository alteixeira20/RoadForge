import { describe, it, expect } from 'vitest'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import type { Phase } from '@/types/roadmap'

function makePhase(overrides: Partial<Phase> = {}): Phase {
  return {
    id: 'p1',
    num: '01',
    name: 'Phase One',
    color: '#808080',
    status: 'active',
    progress: 0,
    tasks: [],
    ...overrides,
  }
}

describe('roadmap-upgrade', () => {
  describe('upgradeRoadmapSnapshot', () => {
    it('returns a valid shape for a clean snapshot', () => {
      const input = { phases: [makePhase()] }
      const result = upgradeRoadmapSnapshot(input)
      expect(result.phases).toHaveLength(1)
      expect(result.phases[0].id).toBe('p1')
      expect(result.phases[0].num).toBe('01')
    })

    it('fills in missing boolean defaults on tasks', () => {
      const phase = makePhase({
        tasks: [
          // done is missing (will be coerced by repair pipeline)
          { id: 't1', title: 'Task', done: false },
        ],
      })
      const input = { phases: [phase] }
      const result = upgradeRoadmapSnapshot(input)
      const task = result.phases[0].tasks[0]
      expect(task.done).toBe(false)
      // next should be normalized to false (boolean) by canonicalizeTask
      expect(task.next).toBe(false)
    })

    it('recalculates stale progress from task completion', () => {
      const phase = makePhase({
        progress: 0,
        tasks: [
          { id: 't1', title: 'Done task', done: true },
          { id: 't2', title: 'Done too', done: true },
        ],
      })
      const input = { phases: [phase] }
      const result = upgradeRoadmapSnapshot(input)
      expect(result.phases[0].progress).toBe(100)
    })

    it('sets changed=true when progress was stale', () => {
      const phase = makePhase({
        progress: 0,
        tasks: [{ id: 't1', title: 'Done', done: true }],
      })
      const result = upgradeRoadmapSnapshot({ phases: [phase] })
      expect(result.changed).toBe(true)
    })

    it('migrates legacy owner:/review: tags to assignees', () => {
      const phase = makePhase({
        tasks: [
          {
            id: 't1',
            title: 'Tagged task',
            done: false,
            tags: ['owner:Alice', 'backend', 'review:Bob'],
          },
        ],
      })
      const result = upgradeRoadmapSnapshot({ phases: [phase] })
      const task = result.phases[0].tasks[0]
      // Assignment tags should be removed from visible tags
      expect(task.tags).not.toContain('owner:Alice')
      expect(task.tags).not.toContain('review:Bob')
      expect(task.tags).toContain('backend')
      // Names should appear in assignees
      expect(task.assignees).toContain('Alice')
      expect(task.assignees).toContain('Bob')
    })

    it('renumbers phases to match their array position', () => {
      const phases = [
        makePhase({ id: 'p1', num: '99' }),
        makePhase({ id: 'p2', num: '98' }),
      ]
      const result = upgradeRoadmapSnapshot({ phases })
      expect(result.phases[0].num).toBe('01')
      expect(result.phases[1].num).toBe('02')
    })

    it('returns empty phases for an empty snapshot', () => {
      const result = upgradeRoadmapSnapshot({ phases: [] })
      expect(result.phases).toEqual([])
    })

    it('accepts a raw phase array as input', () => {
      const phases = [makePhase()]
      const result = upgradeRoadmapSnapshot(phases)
      expect(result.phases).toHaveLength(1)
    })
  })
})
