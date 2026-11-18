import { afterEach, describe, expect, it, vi } from 'vitest'
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

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('roadmap phase factory', () => {
  it('creates a valid active first interactive phase with a collision-resistant id', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID_A)

    expect(createPhase([])).toEqual({
      id: `rf-p-${UUID_A}`,
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
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID_A)

    expect(createPhase([existingPhase])).toMatchObject({
      id: `rf-p-${UUID_A}`,
      num: '02',
      status: 'future',
      progress: 0,
      tasks: [],
    })
  })

  it('retries the UUID generator if an existing phase somehow has the same id', () => {
    const collision = { ...existingPhase, id: `rf-p-${UUID_A}` }
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(UUID_A)
      .mockReturnValueOnce(UUID_B)

    expect(createPhase([collision]).id).toBe(`rf-p-${UUID_B}`)
  })

  it('keeps the canonical deterministic starter phase for blank roadmaps', () => {
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
