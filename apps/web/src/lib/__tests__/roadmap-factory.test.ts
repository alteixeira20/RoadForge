import { describe, expect, it } from 'vitest'
import { createBlankPhases, createPhase } from '@/lib/roadmap-factory'
import type { Phase } from '@/types/roadmap'

const existingPhase: Phase = {
  id: 'rf-p-1',
  num: '01',
  name: 'Existing phase',
  color: '#123456',
  colorMode: 'manual',
  status: 'active',
  progress: 0,
  tasks: [],
}

describe('roadmap phase factory', () => {
  it('creates a valid active first phase', () => {
    expect(createPhase([])).toEqual({
      id: 'rf-p-1',
      num: '01',
      name: 'New phase',
      color: '#76746e',
      colorMode: 'auto',
      status: 'active',
      progress: 0,
      tasks: [],
    })
  })

  it('creates a future phase after the current final phase', () => {
    expect(createPhase([existingPhase])).toMatchObject({
      id: 'rf-p-2',
      num: '02',
      status: 'future',
      progress: 0,
      tasks: [],
    })
  })

  it('avoids an existing generated phase ID', () => {
    const collision = { ...existingPhase, id: 'rf-p-2' }
    expect(createPhase([collision]).id).toBe('rf-p-3')
  })

  it('uses the canonical factory for blank roadmaps and returns fresh data', () => {
    const first = createBlankPhases()
    const second = createBlankPhases()

    expect(first[0]).toMatchObject({
      id: 'rf-p-1',
      num: '01',
      name: 'Planning',
      status: 'active',
    })
    expect(first).not.toBe(second)
    expect(first[0]).not.toBe(second[0])
    expect(first[0].tasks).not.toBe(second[0].tasks)
  })
})
