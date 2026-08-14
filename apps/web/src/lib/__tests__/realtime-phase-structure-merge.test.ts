import { describe, expect, it } from 'vitest'
import { mergeAuthoritativePhaseStructureIntoLocalPhases } from '@/lib/realtime-phase-structure-merge'
import type { Phase } from '@/types/roadmap'

const phaseA: Phase = {
  id: 'phase-a',
  num: '01',
  name: 'Alpha local',
  color: '#111111',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [{ id: 'task-a', title: 'A local draft', done: false }],
}
const phaseB: Phase = {
  id: 'phase-b',
  num: '02',
  name: 'Beta local',
  color: '#222222',
  colorMode: 'auto',
  status: 'future',
  progress: 0,
  tasks: [{
    id: 'task-b',
    title: 'B local draft',
    done: false,
    deps: ['task-a'],
  }],
}
const localPending: Phase = {
  id: 'phase-local-pending',
  num: '03',
  name: 'Pending local create',
  color: '#333333',
  colorMode: 'auto',
  status: 'future',
  progress: 0,
  tasks: [],
}

describe('realtime phase structure merge', () => {
  it('adds a remotely-created phase without replacing unrelated dirty phases', () => {
    const remoteC: Phase = {
      id: 'phase-c',
      num: '03',
      name: 'Remote C',
      color: '#444444',
      colorMode: 'manual',
      status: 'future',
      progress: 0,
      tasks: [],
    }

    const next = mergeAuthoritativePhaseStructureIntoLocalPhases(
      [phaseA, phaseB],
      [{ ...phaseA, name: 'Server Alpha' }, { ...phaseB, name: 'Server Beta' }, remoteC],
      new Set(['phase-c']),
      true,
    )

    expect(next.map((phase) => phase.id)).toEqual(['phase-a', 'phase-b', 'phase-c'])
    expect(next[0]).toBe(phaseA)
    expect(next[1]).toBe(phaseB)
    expect(next[2]).toEqual(remoteC)
  })

  it('removes a remotely-deleted phase and cleans dependencies in surviving dirty tasks', () => {
    const next = mergeAuthoritativePhaseStructureIntoLocalPhases(
      [phaseA, phaseB],
      [{ ...phaseB, num: '01' }],
      new Set(['phase-a']),
      true,
    )

    expect(next.map((phase) => phase.id)).toEqual(['phase-b'])
    expect(next[0].tasks[0]).toEqual(expect.objectContaining({
      title: 'B local draft',
      deps: [],
    }))
  })

  it('applies remote server order while retaining a local-only pending phase', () => {
    const next = mergeAuthoritativePhaseStructureIntoLocalPhases(
      [phaseA, localPending, phaseB],
      [{ ...phaseB, num: '01' }, { ...phaseA, num: '02' }],
      new Set(),
      true,
    )

    expect(next.map((phase) => phase.id)).toEqual([
      'phase-b',
      'phase-a',
      'phase-local-pending',
    ])
    expect(next[0].name).toBe('Beta local')
    expect(next[1].name).toBe('Alpha local')
    expect(next[2].name).toBe('Pending local create')
  })

  it('replaces only an affected same-id local phase with the authoritative remote entity', () => {
    const remoteWinner: Phase = {
      ...localPending,
      name: 'Remote winner',
      color: '#abcdef',
    }

    const next = mergeAuthoritativePhaseStructureIntoLocalPhases(
      [phaseA, localPending],
      [phaseA, remoteWinner],
      new Set(['phase-local-pending']),
      true,
    )

    expect(next[0]).toBe(phaseA)
    expect(next[1]).toEqual(remoteWinner)
  })
})
