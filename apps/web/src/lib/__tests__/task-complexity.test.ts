import { describe, expect, it } from 'vitest'
import { getTaskCompletionBlocker } from '@/lib/task-completion'
import {
  DEFAULT_TASK_COMPLEXITY,
  getTaskComplexity,
  getTaskComplexityStructureIssue,
} from '@/lib/task-complexity'
import type { Task } from '@/types/roadmap'

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { id, title: id, done: false, ...overrides }
}

describe('task complexity', () => {
  it('defaults legacy tasks to Medium', () => {
    expect(getTaskComplexity(task('legacy'))).toBe(DEFAULT_TASK_COMPLEXITY)
  })

  it('requires two direct subtasks for Very high top-level work', () => {
    const parent = task('parent', { complexity: 'very_high' })
    expect(getTaskComplexityStructureIssue(parent, [parent])).toContain('at least two direct subtasks')

    const one = task('one', { parentId: 'parent' })
    expect(getTaskComplexityStructureIssue(parent, [parent, one])).toContain('at least two direct subtasks')

    const two = task('two', { parentId: 'parent' })
    expect(getTaskComplexityStructureIssue(parent, [parent, one, two])).toBeNull()
  })

  it('does not allow Very high on nested work', () => {
    const nested = task('nested', { parentId: 'parent', complexity: 'very_high' })
    expect(getTaskComplexityStructureIssue(nested, [task('parent'), nested])).toContain('top-level')
  })

  it('blocks completion while a Very high task is structurally undecomposed', () => {
    const parent = task('parent', { complexity: 'very_high' })
    expect(getTaskCompletionBlocker(parent, [parent])).toContain('at least two direct subtasks')
  })
})
