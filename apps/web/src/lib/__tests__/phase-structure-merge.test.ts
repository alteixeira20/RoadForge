import { describe, expect, it } from 'vitest'
import {
  orderPhasesByPreference,
  reconcileCreatedPhaseAcknowledgement,
  removePhaseAndDanglingDependencies,
} from '@/lib/phase-structure-merge'
import type { Phase } from '@/types/roadmap'

const phases: Phase[] = [
  {
    id: 'phase-a',
    num: '01',
    name: 'Alpha',
    color: '#111111',
    colorMode: 'auto',
    status: 'active',
    progress: 0,
    tasks: [{ id: 'task-a', title: 'A', done: false }],
  },
  {
    id: 'phase-b',
    num: '02',
    name: 'Beta',
    color: '#222222',
    colorMode: 'auto',
    status: 'future',
    progress: 0,
    tasks: [{
      id: 'task-b',
      title: 'B',
      done: false,
      deps: ['task-a', 'external-task'],
      desc: 'keep this local draft',
    }],
  },
]

describe('phase structure merge helpers', () => {
  it('removes dependencies on tasks deleted with a phase and renumbers survivors', () => {
    const next = removePhaseAndDanglingDependencies(phases, 'phase-a')

    expect(next).toEqual([
      expect.objectContaining({
        id: 'phase-b',
        num: '01',
        tasks: [expect.objectContaining({
          id: 'task-b',
          deps: ['external-task'],
          desc: 'keep this local draft',
        })],
      }),
    ])
  })

  it('orders known phases while preserving local-only phases', () => {
    const localOnly: Phase = {
      ...phases[0],
      id: 'phase-local',
      num: '03',
      name: 'Pending local create',
      tasks: [],
    }

    const next = orderPhasesByPreference(
      [...phases, localOnly],
      ['phase-b', 'phase-a', 'server-only'],
    )

    expect(next.map((phase) => phase.id)).toEqual(['phase-b', 'phase-a', 'phase-local'])
    expect(next.map((phase) => phase.num)).toEqual(['01', '02', '03'])
  })

  it('accepts server-owned create metadata without overwriting a newer local name', () => {
    const localCreated: Phase = {
      ...phases[0],
      id: 'phase-c',
      num: '03',
      name: 'Immediate local rename',
      color: '#333333',
      status: 'future',
      tasks: [],
    }
    const serverCreated: Phase = {
      ...localCreated,
      name: 'New phase',
      num: '02',
      progress: 0,
    }

    const next = reconcileCreatedPhaseAcknowledgement(
      [phases[0], localCreated],
      [phases[0], serverCreated],
      'phase-c',
    )

    expect(next?.map((phase) => phase.id)).toEqual(['phase-a', 'phase-c'])
    expect(next?.[1]).toEqual(expect.objectContaining({
      name: 'Immediate local rename',
      num: '02',
    }))
  })
})
