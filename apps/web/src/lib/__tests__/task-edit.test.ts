import { describe, expect, it } from 'vitest'
import {
  createTaskEditDraft,
  isTaskDescriptionDirty,
  isTaskEditDraftDirty,
} from '@/lib/task-edit'
import type { Task } from '@/types/roadmap'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Task',
    done: false,
    ...overrides,
  }
}

describe('createTaskEditDraft', () => {
  it('normalizes missing optional metadata to empty edit values', () => {
    expect(createTaskEditDraft(makeTask())).toEqual({
      title: 'Task',
      est: '',
      desc: '',
      assignees: [],
      tags: [],
    })
  })

  it('normalizes legacy assignment tags for metadata editing', () => {
    const task = makeTask({
      tags: ['owner:  Alice  Smith ', 'backend', 'review:alice smith'],
    })

    expect(createTaskEditDraft(task)).toMatchObject({
      assignees: ['Alice Smith'],
      tags: ['backend'],
    })
  })
})

describe('isTaskEditDraftDirty', () => {
  it('treats normalized metadata as an unchanged draft', () => {
    const task = makeTask({
      est: '2d',
      desc: 'Details',
      tags: ['owner:Alice', 'frontend'],
    })

    expect(isTaskEditDraftDirty(createTaskEditDraft(task), task)).toBe(false)
  })

  it.each([
    ['estimate', { est: '3d' }],
    ['description', { desc: 'Updated details' }],
    ['assignees', { assignees: ['Alice', 'Bob'] }],
    ['tags', { tags: ['frontend', 'urgent'] }],
  ])('detects changed %s metadata', (_label, updates) => {
    const task = makeTask({
      est: '2d',
      desc: 'Details',
      assignees: ['Alice'],
      tags: ['frontend'],
    })
    const draft = { ...createTaskEditDraft(task), ...updates }

    expect(isTaskEditDraftDirty(draft, task)).toBe(true)
  })

  it('compares metadata items without comma-join collisions', () => {
    const task = makeTask({ assignees: ['Alpha,Beta', 'Gamma'] })
    const draft = {
      ...createTaskEditDraft(task),
      assignees: ['Alpha', 'Beta,Gamma'],
    }

    expect(isTaskEditDraftDirty(draft, task)).toBe(true)
  })
})

describe('isTaskDescriptionDirty', () => {
  it('preserves exact Markdown and whitespace in dirty checks', () => {
    expect(isTaskDescriptionDirty('Details', 'Details')).toBe(false)
    expect(isTaskDescriptionDirty('Details', 'Details\n')).toBe(true)
  })
})
