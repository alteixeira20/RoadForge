import { describe, it, expect } from 'vitest'
import { buildTaskDonePhases, commitTaskField } from '@/hooks/taskMutationHelpers'
import type { Phase, Task } from '@/types/roadmap'

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

const EDITABLE_TASK: Task = {
  id: 'tk_edit',
  title: 'Original title',
  done: false,
  est: '2d',
  desc: 'Original **Markdown**',
  tags: ['frontend'],
  assignees: ['Alice'],
}

describe('commitTaskField', () => {
  it('trims a valid title without changing unrelated fields', () => {
    const result = commitTaskField(EDITABLE_TASK, 'title', '  Updated title  ')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(true)
    expect(result.updates).toEqual({ title: 'Updated title' })
    expect(result.task).toEqual({ ...EDITABLE_TASK, title: 'Updated title' })
    expect(EDITABLE_TASK.title).toBe('Original title')
  })

  it('rejects an empty trimmed title and returns the unchanged task', () => {
    const result = commitTaskField(EDITABLE_TASK, 'title', ' \n\t ')

    expect(result).toEqual({
      ok: false,
      reason: 'empty-title',
      task: EDITABLE_TASK,
    })
    expect(result.task).toBe(EDITABLE_TASK)
  })

  it('trims estimates and clears an estimate with empty input', () => {
    const trimmed = commitTaskField(EDITABLE_TASK, 'est', '  5h ')
    const cleared = commitTaskField(EDITABLE_TASK, 'est', '   ')

    expect(trimmed.ok && trimmed.updates).toEqual({ est: '5h' })
    expect(cleared.ok && cleared.updates).toEqual({ est: '' })
  })

  it('preserves description Markdown source exactly', () => {
    const markdown = '  ## Heading\n\n- item  \n'
    const result = commitTaskField(EDITABLE_TASK, 'desc', markdown)

    expect(result.ok && result.updates).toEqual({ desc: markdown })
    expect(result.ok && result.task.desc).toBe(markdown)
  })

  it('returns the original task when the normalized value is unchanged', () => {
    const result = commitTaskField(EDITABLE_TASK, 'title', ' Original title ')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(false)
    expect(result.task).toBe(EDITABLE_TASK)
    expect(result.updates).toEqual({ title: 'Original title' })
  })

  it('sets tags and reports changed', () => {
    const result = commitTaskField(EDITABLE_TASK, 'tags', ['frontend', 'urgent'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(true)
    expect(result.updates).toEqual({ tags: ['frontend', 'urgent'] })
    expect(result.task.tags).toEqual(['frontend', 'urgent'])
  })

  it('reports tags unchanged when next tags match visible tags', () => {
    const result = commitTaskField(EDITABLE_TASK, 'tags', ['frontend'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(false)
  })

  it('compares tags against visible tags only, ignoring legacy assignment tags', () => {
    const taskWithLegacyTag: Task = { ...EDITABLE_TASK, tags: ['owner:Alice', 'frontend'] }
    const result = commitTaskField(taskWithLegacyTag, 'tags', ['frontend'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(false)
  })

  it('drops legacy assignment tags once tags are committed', () => {
    const taskWithLegacyTag: Task = { ...EDITABLE_TASK, tags: ['owner:Alice', 'frontend'] }
    const result = commitTaskField(taskWithLegacyTag, 'tags', ['frontend', 'design'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.task.tags).toEqual(['frontend', 'design'])
  })

  it('handles removing all tags', () => {
    const result = commitTaskField(EDITABLE_TASK, 'tags', [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(true)
    expect(result.task.tags).toEqual([])
  })

  it('sets assignees and reports changed', () => {
    const result = commitTaskField(EDITABLE_TASK, 'assignees', ['Alice', 'Bob'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(true)
    expect(result.task.assignees).toEqual(['Alice', 'Bob'])
  })

  it('reports assignees unchanged when next assignees match current', () => {
    const result = commitTaskField(EDITABLE_TASK, 'assignees', ['Alice'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(false)
  })

  it('compares assignees against names derived from legacy assignment tags', () => {
    const taskWithLegacyAssignee: Task = { id: 'tk_legacy', title: 'Legacy', done: false, tags: ['owner:Carol'] }
    const result = commitTaskField(taskWithLegacyAssignee, 'assignees', ['Carol'])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(false)
  })

  it('handles removing all assignees', () => {
    const result = commitTaskField(EDITABLE_TASK, 'assignees', [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(true)
    expect(result.task.assignees).toEqual([])
  })
})
