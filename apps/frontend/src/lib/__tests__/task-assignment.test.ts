import { describe, it, expect } from 'vitest'
import {
  isAssignmentTag,
  assignmentNameFromTag,
  addTaskAssignee,
  getTaskAssignees,
  dedupeNames,
  getVisibleTaskTags,
} from '@/lib/task-assignment'
import type { Task } from '@/types/roadmap'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'A task',
    done: false,
    ...overrides,
  }
}

describe('task-assignment', () => {
  describe('isAssignmentTag', () => {
    it('returns true for owner: tag', () => {
      expect(isAssignmentTag('owner:Alice')).toBe(true)
    })

    it('returns true for review: tag', () => {
      expect(isAssignmentTag('review:Bob')).toBe(true)
    })

    it('returns true regardless of casing', () => {
      expect(isAssignmentTag('OWNER:Alice')).toBe(true)
      expect(isAssignmentTag('Review:Bob')).toBe(true)
    })

    it('returns false for a regular tag', () => {
      expect(isAssignmentTag('feature')).toBe(false)
    })

    it('returns false for an empty string', () => {
      expect(isAssignmentTag('')).toBe(false)
    })
  })

  describe('assignmentNameFromTag', () => {
    it('extracts the name from an owner: tag', () => {
      expect(assignmentNameFromTag('owner:Alice')).toBe('Alice')
    })

    it('extracts the name from a review: tag', () => {
      expect(assignmentNameFromTag('review:Bob Smith')).toBe('Bob Smith')
    })

    it('returns null for a non-assignment tag', () => {
      expect(assignmentNameFromTag('backend')).toBeNull()
    })

    it('returns null when the name part is empty', () => {
      expect(assignmentNameFromTag('owner:')).toBeNull()
    })
  })

  describe('getTaskAssignees', () => {
    it('returns assignees from the assignees field when present', () => {
      const task = makeTask({ assignees: ['Alice', 'Bob'] })
      expect(getTaskAssignees(task)).toEqual(['Alice', 'Bob'])
    })

    it('falls back to assignment tags when assignees is empty', () => {
      const task = makeTask({ tags: ['owner:Carol', 'backend'] })
      expect(getTaskAssignees(task)).toEqual(['Carol'])
    })

    it('returns an empty array when there are no assignment tags or assignees', () => {
      const task = makeTask({ tags: ['backend', 'urgent'] })
      expect(getTaskAssignees(task)).toEqual([])
    })

    it('returns an empty array when task has no tags or assignees', () => {
      const task = makeTask()
      expect(getTaskAssignees(task)).toEqual([])
    })
  })

  describe('dedupeNames', () => {
    it('removes duplicate names (case-insensitive)', () => {
      expect(dedupeNames(['Alice', 'alice', 'ALICE'])).toEqual(['Alice'])
    })

    it('preserves order of first occurrence', () => {
      expect(dedupeNames(['Bob', 'Alice', 'bob'])).toEqual(['Bob', 'Alice'])
    })

    it('filters out empty strings', () => {
      expect(dedupeNames(['Alice', '', '  '])).toEqual(['Alice'])
    })
  })

  describe('addTaskAssignee', () => {
    it('preserves assignees and appends a new participant', () => {
      const task = makeTask({ assignees: ['Alice', 'Bob'] })
      expect(addTaskAssignee(task, 'Carol').assignees).toEqual(['Alice', 'Bob', 'Carol'])
    })

    it('deduplicates names case-insensitively', () => {
      const task = makeTask({ assignees: ['Alice'] })
      expect(addTaskAssignee(task, ' alice ').assignees).toEqual(['Alice'])
    })

    it('preserves legacy assignment-tag names when creating assignees', () => {
      const task = makeTask({ tags: ['owner:Alice', 'backend'] })
      expect(addTaskAssignee(task, 'Bob').assignees).toEqual(['Alice', 'Bob'])
      expect(task.tags).toEqual(['owner:Alice', 'backend'])
    })
  })

  describe('getVisibleTaskTags', () => {
    it('filters out assignment tags and keeps regular tags', () => {
      const task = makeTask({ tags: ['owner:Alice', 'backend', 'review:Bob', 'urgent'] })
      expect(getVisibleTaskTags(task)).toEqual(['backend', 'urgent'])
    })

    it('returns all tags when none are assignment tags', () => {
      const task = makeTask({ tags: ['backend', 'v2'] })
      expect(getVisibleTaskTags(task)).toEqual(['backend', 'v2'])
    })

    it('returns empty array when task has no tags', () => {
      const task = makeTask()
      expect(getVisibleTaskTags(task)).toEqual([])
    })
  })
})
