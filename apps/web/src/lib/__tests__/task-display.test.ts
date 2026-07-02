import { describe, it, expect } from 'vitest'
import { computeTaskDisplayNumbers, deriveTaskStatus, getBlockingTasks } from '@/lib/task-display'
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

describe('deriveTaskStatus', () => {
  const dependency = makeTask('dependency')

  it('derives each display status from existing task fields', () => {
    expect(deriveTaskStatus(makeTask('done', { done: true }), [])).toBe('done')
    expect(deriveTaskStatus(makeTask('active', { claimedBy: 'Ada' }), [])).toBe('in-progress')
    expect(deriveTaskStatus(makeTask('ready', { next: true }), [])).toBe('ready')
    expect(deriveTaskStatus(makeTask('planned'), [])).toBe('planned')
  })

  it('derives blocked from incomplete dependencies', () => {
    const task = makeTask('blocked', { deps: [dependency.id] })
    expect(deriveTaskStatus(task, [task, dependency])).toBe('blocked')
    expect(getBlockingTasks(task, [task, dependency])).toEqual([dependency])
  })

  it('does not block on completed or missing dependencies', () => {
    const task = makeTask('ready', { deps: ['done', 'missing'], next: true })
    const done = makeTask('done', { done: true })
    expect(deriveTaskStatus(task, [task, done])).toBe('ready')
  })

  it('uses status precedence for conflicting source fields', () => {
    const blockedAndReady = makeTask('mixed', { deps: [dependency.id], next: true })
    const claimedAndBlocked = { ...blockedAndReady, claimedBy: 'Ada' }
    const doneAndClaimed = { ...claimedAndBlocked, done: true }

    expect(deriveTaskStatus(blockedAndReady, [blockedAndReady, dependency])).toBe('blocked')
    expect(deriveTaskStatus(claimedAndBlocked, [claimedAndBlocked, dependency])).toBe('in-progress')
    expect(deriveTaskStatus(doneAndClaimed, [doneAndClaimed, dependency])).toBe('done')
  })
})
