import type { Task } from '@/types/roadmap'

/**
 * Returns null when completing the task is allowed.
 * Returns the exact toast message string when completion must be blocked.
 *
 * Pure function — no side effects, no mutations.
 */
export function getTaskCompletionBlocker(task: Task, allTasks: Task[]): string | null {
  const subtasks = allTasks.filter((st) => st.parentId === task.id)
  const unfinishedSubtasks = subtasks.filter((st) => !st.done)

  const depIds = task.deps || []
  const unfinishedDeps: Task[] = []
  const missingDepIds: string[] = []

  depIds.forEach((dId) => {
    const d = allTasks.find((at) => at.id === dId)
    if (!d) {
      missingDepIds.push(dId)
    } else if (!d.done) {
      unfinishedDeps.push(d)
    }
  })

  if (unfinishedSubtasks.length === 0 && unfinishedDeps.length === 0 && missingDepIds.length === 0) {
    return null
  }

  if (missingDepIds.length > 0) {
    return `Cannot complete task: missing dependency ${missingDepIds[0]}`
  }

  if (unfinishedSubtasks.length > 0 && unfinishedDeps.length > 0) {
    return 'Complete all subtasks and dependencies first.'
  }

  if (unfinishedSubtasks.length > 0) {
    return 'Complete all subtasks first.'
  }

  if (unfinishedDeps.length === 1) {
    return `Complete ${unfinishedDeps[0].id} — ${unfinishedDeps[0].title} first.`
  }

  const count = unfinishedDeps.length
  const ids = unfinishedDeps.map((d) => d.id).join(', ')
  return `Complete ${count} blockers first: ${ids}`
}
