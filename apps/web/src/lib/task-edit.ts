import { getTaskAssignees, getVisibleTaskTags } from '@/lib/task-assignment'
import type { Task } from '@/types/roadmap'

export interface TaskEditDraft {
  title: string
  est: string
  desc: string
  assignees: string[]
  tags: string[]
}

export function createTaskEditDraft(task: Task): TaskEditDraft {
  return {
    title: task.title,
    est: task.est ?? '',
    desc: task.desc ?? '',
    assignees: getTaskAssignees(task),
    tags: getVisibleTaskTags(task),
  }
}

function itemsMatch(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.every((item, index) => item === right[index])
}

export function isTaskEditDraftDirty(draft: TaskEditDraft, task: Task): boolean {
  const initial = createTaskEditDraft(task)
  return draft.title !== initial.title
    || draft.est !== initial.est
    || draft.desc !== initial.desc
    || !itemsMatch(draft.assignees, initial.assignees)
    || !itemsMatch(draft.tags, initial.tags)
}

export function isTaskDescriptionDirty(value: string, draft: string): boolean {
  return draft !== value
}
