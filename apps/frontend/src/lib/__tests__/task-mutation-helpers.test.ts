import { describe, it, expect } from 'vitest'
import { buildTaskDonePhases } from '@/hooks/taskMutationHelpers'
import type { Phase } from '@/types/roadmap'

const CLAIMED_PHASE: Phase = {
  id: 'ph_1',
  num: '01',
  name: 'Phase',
  color: '#aaa',
  status: 'active',
  progress: 0,
  tasks: [
    {
      id: 'tk_1',
      title: 'Claimed task',
      done: false,
      claimedBy: 'Alice',
      claimedById: 'pt_alice',
      claimedAt: '2026-06-01T10:00:00Z',
    },
    {
      id: 'tk_2',
      title: 'Unclaimed task',
      done: false,
    },
  ],
}

describe('buildTaskDonePhases', () => {
  it('clears claim fields when marking done=true', () => {
    const result = buildTaskDonePhases('tk_1', true, [CLAIMED_PHASE])
    const task = result[0]!.tasks[0]!
    expect(task.done).toBe(true)
    expect(task.claimedBy).toBeUndefined()
    expect(task.claimedById).toBeUndefined()
    expect(task.claimedAt).toBeUndefined()
  })

  it('preserves claim fields when marking done=false (reopening)', () => {
    const claimedDonePhase: Phase = {
      ...CLAIMED_PHASE,
      tasks: [{ ...CLAIMED_PHASE.tasks[0]!, done: true }],
    }
    const result = buildTaskDonePhases('tk_1', false, [claimedDonePhase])
    const task = result[0]!.tasks[0]!
    expect(task.done).toBe(false)
    expect(task.claimedBy).toBe('Alice')
  })

  it('does not affect other tasks', () => {
    const result = buildTaskDonePhases('tk_1', true, [CLAIMED_PHASE])
    const otherTask = result[0]!.tasks[1]!
    expect(otherTask.id).toBe('tk_2')
    expect(otherTask.done).toBe(false)
  })

  it('marks the target task done without touching claim when done=true and no claim', () => {
    const result = buildTaskDonePhases('tk_2', true, [CLAIMED_PHASE])
    const task = result[0]!.tasks[1]!
    expect(task.done).toBe(true)
    expect(task.claimedBy).toBeUndefined()
  })
})
