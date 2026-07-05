import { describe, expect, it } from 'vitest'
import {
  buildChangeSummary,
  getChangedTaskFields,
  getTaskUpdateFieldSummary,
  getTaskUpdateLabel,
  mergePendingActivityChange,
} from '@/lib/activity-changes'
import type { ActivityChange, Task } from '@/types/roadmap'

const TASK: Task = {
  id: 'RF-205',
  title: 'Normalize activity',
  done: false,
  desc: 'Original description',
  est: '2d',
  assignees: ['Alice'],
  tags: ['frontend'],
}

function taskUpdate(
  changedFields: ActivityChange['changedFields'],
  taskTitle = TASK.title,
): ActivityChange {
  return {
    action: 'task.updated',
    entity_type: 'task',
    entity_id: TASK.id,
    taskId: TASK.id,
    taskTitle,
    changedFields,
  }
}

describe('getChangedTaskFields', () => {
  it('identifies inline title and description edits', () => {
    expect(getChangedTaskFields(TASK, { title: 'Clear activity' })).toEqual(['title'])
    expect(getChangedTaskFields(TASK, { desc: 'Updated description' })).toEqual(['desc'])
  })

  it('identifies changed task metadata in a stable display order', () => {
    expect(getChangedTaskFields(TASK, {
      tags: ['frontend', 'activity'],
      est: '3d',
      assignees: ['Alice', 'Bob'],
    })).toEqual(['est', 'assignees', 'tags'])
  })

  it('treats normalized legacy assignment metadata as unchanged', () => {
    const legacyTask = {
      ...TASK,
      assignees: undefined,
      tags: ['owner:Alice', 'frontend'],
    }

    expect(getChangedTaskFields(legacyTask, {
      assignees: ['Alice'],
      tags: ['frontend'],
    })).toEqual([])
  })
})

describe('task update activity text', () => {
  it.each([
    [['title'], 'Renamed task', 'title changed'],
    [['desc'], 'Updated task description', 'description changed'],
    [['est', 'assignees', 'tags'], 'Updated task details', 'estimate, assignees, and tags changed'],
    [['links'], 'Updated task details', 'GitHub links changed'],
    [['title', 'desc'], 'Updated task', 'title and description changed'],
  ] as const)('formats %j updates', (changedFields, label, summary) => {
    const metadata = { changedFields: [...changedFields] }
    expect(getTaskUpdateLabel(metadata)).toBe(label)
    expect(getTaskUpdateFieldSummary(metadata)).toBe(summary)
  })

  it('keeps the generic label for existing activity without field metadata', () => {
    expect(getTaskUpdateLabel(null)).toBe('Updated task')
    expect(getTaskUpdateFieldSummary(null)).toBeNull()
  })
})

describe('mergePendingActivityChange', () => {
  it('merges repeated task edits into one row and retains all changed fields', () => {
    const titleChange = taskUpdate(['title'], 'Renamed task')
    const descriptionChange = taskUpdate(['desc'], 'Renamed task')

    const merged = mergePendingActivityChange([titleChange], descriptionChange)

    expect(merged).toEqual([
      taskUpdate(['title', 'desc'], 'Renamed task'),
    ])
    expect(buildChangeSummary(merged)).toEqual(merged[0])
  })

  it('does not claim specific fields when either update lacks field metadata', () => {
    const merged = mergePendingActivityChange(
      [taskUpdate(['title'])],
      taskUpdate(undefined),
    )

    expect(merged).toEqual([taskUpdate(undefined)])
  })
})
