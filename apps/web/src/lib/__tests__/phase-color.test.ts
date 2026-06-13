import { describe, expect, it } from 'vitest'
import { derivePhaseColor, getPhaseDisplayColor } from '@/lib/phase-color'
import type { Phase } from '@/types/roadmap'

const phase = (overrides: Partial<Phase> = {}): Phase => ({
  id: 'phase-1',
  num: '01',
  name: 'Foundation',
  color: '#a855f7',
  status: 'future',
  progress: 0,
  tasks: [],
  ...overrides,
})

describe('phase color modes', () => {
  it('keeps the stored color in manual mode', () => {
    expect(getPhaseDisplayColor(phase({ colorMode: 'manual' })).color).toBe('#a855f7')
  })

  it('uses green when every task is complete', () => {
    expect(derivePhaseColor(phase({
      tasks: [{ id: 't1', title: 'Done', done: true }],
    })).color).toBe('#22c55e')
  })

  it('uses the active color when an open task is claimed', () => {
    expect(derivePhaseColor(phase({
      tasks: [{ id: 't1', title: 'Work', done: false, claimedBy: 'Ada' }],
    })).color).toBe('#f97316')
  })

  it('uses a neutral blocked color when every open task is blocked', () => {
    expect(derivePhaseColor(phase({
      tasks: [
        { id: 't1', title: 'Dependency', done: false },
        { id: 't2', title: 'Blocked', done: false, deps: ['t1'] },
      ],
    })).color).not.toBe('#6b7280')

    expect(derivePhaseColor(phase({
      tasks: [
        { id: 't1', title: 'Blocked A', done: false, deps: ['t2'] },
        { id: 't2', title: 'Blocked B', done: false, deps: ['t1'] },
      ],
    })).color).toBe('#6b7280')
  })
})
