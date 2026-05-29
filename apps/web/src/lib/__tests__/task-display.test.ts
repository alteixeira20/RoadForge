import { describe, it, expect } from 'vitest'
import { computeTaskDisplayNumbers } from '@/lib/task-display'
import type { Phase } from '@/types/roadmap'

function makePhase(num: string, tasks: Phase['tasks']): Phase {
  return {
    id: `ph-${num}`,
    num,
    name: `Phase ${num}`,
    color: '#000',
    status: 'active',
    progress: 0,
    tasks,
  }
}

function makeTask(id: string, overrides: Partial<Phase['tasks'][0]> = {}): Phase['tasks'][0] {
  return { id, title: id, done: false, ...overrides }
}

describe('computeTaskDisplayNumbers', () => {
  it('returns an empty map for empty phases', () => {
    const map = computeTaskDisplayNumbers([])
    expect(map.size).toBe(0)
  })

  it('numbers top-level tasks per phase using phase.num', () => {
    const phases = [
      makePhase('01', [makeTask('t-1'), makeTask('t-2')]),
      makePhase('02', [makeTask('t-3')]),
    ]
    const map = computeTaskDisplayNumbers(phases)
    expect(map.get('t-1')).toBe('1.1')
    expect(map.get('t-2')).toBe('1.2')
    expect(map.get('t-3')).toBe('2.1')
  })

  it('numbers subtasks as nested display numbers', () => {
    const phases = [
      makePhase('01', [
        makeTask('t-1'),
        makeTask('sub-a', { parentId: 't-1' }),
        makeTask('sub-b', { parentId: 't-1' }),
      ]),
    ]
    const map = computeTaskDisplayNumbers(phases)
    expect(map.get('t-1')).toBe('1.1')
    expect(map.get('sub-a')).toBe('1.1.1')
    expect(map.get('sub-b')).toBe('1.1.2')
  })

  it('does not mutate task IDs', () => {
    const task = makeTask('RF-2401')
    const phases = [makePhase('01', [task])]
    computeTaskDisplayNumbers(phases)
    expect(task.id).toBe('RF-2401')
  })

  it('handles phases with no top-level tasks gracefully', () => {
    const phases = [makePhase('01', [])]
    const map = computeTaskDisplayNumbers(phases)
    expect(map.size).toBe(0)
  })

  it('skips subtasks when computing top-level order', () => {
    const phases = [
      makePhase('03', [
        makeTask('t-1'),
        makeTask('sub-1', { parentId: 't-1' }),
        makeTask('t-2'),
      ]),
    ]
    const map = computeTaskDisplayNumbers(phases)
    expect(map.get('t-1')).toBe('3.1')
    expect(map.get('t-2')).toBe('3.2')
    expect(map.get('sub-1')).toBe('3.1.1')
  })
})
