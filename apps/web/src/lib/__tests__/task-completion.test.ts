import { describe, it, expect } from 'vitest'
import { getTaskCompletionBlocker } from '@/lib/task-completion'
import type { Task } from '@/types/roadmap'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Do something',
    done: false,
    ...overrides,
  }
}

describe('task-completion', () => {
  describe('getTaskCompletionBlocker', () => {
    it('returns null when task has no deps and no subtasks', () => {
      const task = makeTask({ id: 'task-1' })
      expect(getTaskCompletionBlocker(task, [task])).toBeNull()
    })

    it('returns null when all subtasks are done', () => {
      const task = makeTask({ id: 'parent' })
      const sub = makeTask({ id: 'child', parentId: 'parent', done: true })
      expect(getTaskCompletionBlocker(task, [task, sub])).toBeNull()
    })

    it('blocks when a subtask is not done', () => {
      const task = makeTask({ id: 'parent' })
      const sub = makeTask({ id: 'child', parentId: 'parent', done: false })
      const result = getTaskCompletionBlocker(task, [task, sub])
      expect(result).toBe('Complete all subtasks first.')
    })

    it('blocks when a dependency is not done', () => {
      const dep = makeTask({ id: 'dep-1', title: 'Dep Task', done: false })
      const task = makeTask({ id: 'task-main', deps: ['dep-1'] })
      const result = getTaskCompletionBlocker(task, [task, dep])
      expect(result).toBe('Complete dep-1 — Dep Task first.')
    })

    it('blocks with count when multiple dependencies are unfinished', () => {
      const dep1 = makeTask({ id: 'dep-1', title: 'First', done: false })
      const dep2 = makeTask({ id: 'dep-2', title: 'Second', done: false })
      const task = makeTask({ id: 'main', deps: ['dep-1', 'dep-2'] })
      const result = getTaskCompletionBlocker(task, [task, dep1, dep2])
      expect(result).toBe('Complete 2 blockers first: dep-1, dep-2')
    })

    it('returns missing dependency message when dep id not found', () => {
      const task = makeTask({ id: 'task-1', deps: ['ghost-id'] })
      const result = getTaskCompletionBlocker(task, [task])
      expect(result).toBe('Cannot complete task: missing dependency ghost-id')
    })

    it('blocks with combined message when both subtasks and deps are unfinished', () => {
      const dep = makeTask({ id: 'dep-1', title: 'Dep', done: false })
      const sub = makeTask({ id: 'sub-1', parentId: 'parent', done: false })
      const task = makeTask({ id: 'parent', deps: ['dep-1'] })
      const result = getTaskCompletionBlocker(task, [task, dep, sub])
      expect(result).toBe('Complete all subtasks and dependencies first.')
    })
  })
})
