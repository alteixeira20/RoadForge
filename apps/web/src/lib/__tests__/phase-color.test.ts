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

  it('uses orange when some but not all tasks are complete', () => {
    expect(derivePhaseColor(phase({
      tasks: [
        { id: 't1', title: 'Done', done: true },
        { id: 't2', title: 'Open', done: false },
      ],
    })).color).toBe('#f97316')
  })

  it('uses grey for empty phases and phases with no completed tasks', () => {
    expect(derivePhaseColor(phase()).color).toBe('#64748b')
    expect(derivePhaseColor(phase({
      status: 'active',
      tasks: [{ id: 't1', title: 'Claimed', done: false, claimedBy: 'Ada' }],
    })).color).toBe('#64748b')
  })

  it('defaults a missing color mode to auto', () => {
    expect(getPhaseDisplayColor(phase({
      color: '#a855f7',
      tasks: [{ id: 't1', title: 'Open', done: false }],
    })).color).toBe('#64748b')
  })
})
