import { describe, it, expect } from 'vitest'
import {
  computePhaseProgress,
  normalizePhaseProgress,
  renumberPhases,
} from '@/lib/phase-progress'
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

describe('phase-progress', () => {
  describe('computePhaseProgress', () => {
    it('returns 0 when phase has no tasks', () => {
      const phase = makePhase({ tasks: [] })
      expect(computePhaseProgress(phase)).toBe(0)
    })

    it('returns 100 when all tasks are done', () => {
      const phase = makePhase({
        tasks: [
          { id: 't1', title: 'A', done: true },
          { id: 't2', title: 'B', done: true },
        ],
      })
      expect(computePhaseProgress(phase)).toBe(100)
    })

    it('returns the rounded percentage for partial completion', () => {
      const phase = makePhase({
        tasks: [
          { id: 't1', title: 'A', done: true },
          { id: 't2', title: 'B', done: false },
          { id: 't3', title: 'C', done: false },
        ],
      })
      // 1/3 = 33.33... → rounds to 33
      expect(computePhaseProgress(phase)).toBe(33)
    })
  })

  describe('normalizePhaseProgress', () => {
    it('returns the same phase reference when progress is already correct', () => {
      const phase = makePhase({ tasks: [], progress: 0 })
      const result = normalizePhaseProgress(phase)
      expect(result).toBe(phase)
    })

    it('returns a new phase with updated progress when it is stale', () => {
      const phase = makePhase({
        progress: 50,
        tasks: [
          { id: 't1', title: 'A', done: true },
          { id: 't2', title: 'B', done: true },
        ],
      })
      const result = normalizePhaseProgress(phase)
      expect(result).not.toBe(phase)
      expect(result.progress).toBe(100)
    })
  })

  describe('renumberPhases', () => {
    it('assigns 1-based zero-padded numbers matching array position', () => {
      const phases = [
        makePhase({ id: 'p1', num: '99' }),
        makePhase({ id: 'p2', num: '99' }),
        makePhase({ id: 'p3', num: '99' }),
      ]
      const result = renumberPhases(phases)
      expect(result[0].num).toBe('01')
      expect(result[1].num).toBe('02')
      expect(result[2].num).toBe('03')
    })

    it('returns the same phase reference when num is already correct', () => {
      const phase = makePhase({ num: '01' })
      const result = renumberPhases([phase])
      expect(result[0]).toBe(phase)
    })
  })
})
