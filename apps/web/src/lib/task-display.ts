import type { Phase, Task } from '@/types/roadmap'

export type DerivedTaskStatus = 'done' | 'in-progress' | 'blocked' | 'ready' | 'planned'

export const TASK_STATUS_LABELS: Record<DerivedTaskStatus, string> = {
  done: 'Done',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  ready: 'Ready to start',
  planned: 'Planned',
}

export function getBlockingTasks(task: Task, allTasks: Task[]): Task[] {
  const tasksById = new Map(allTasks.map((candidate) => [candidate.id, candidate]))
  return (task.deps ?? [])
    .map((dependencyId) => tasksById.get(dependencyId))
    .filter((dependency): dependency is Task => Boolean(dependency && !dependency.done))
}

export function deriveTaskStatus(task: Task, allTasks: Task[]): DerivedTaskStatus {
  if (task.done) return 'done'
  if (task.claimedBy) return 'in-progress'
  if (getBlockingTasks(task, allTasks).length > 0) return 'blocked'
  if (task.next) return 'ready'
  return 'planned'
}

/**
 * Computes visual display numbers for all tasks in a roadmap.
 * Returns a Map<taskId, displayString> — e.g. "2.3" for the 3rd task in phase 2,
 * "2.3.1" for its first subtask. Stable task IDs are never modified.
 */
export function computeTaskDisplayNumbers(phases: Phase[]): Map<string, string> {
  const map = new Map<string, string>()

  for (const phase of phases) {
    const phaseNum = parseInt(phase.num, 10)
    const topLevelTasks = phase.tasks.filter((t) => !t.parentId)

    topLevelTasks.forEach((task, taskIdx) => {
      const taskDisplay = `${phaseNum}.${taskIdx + 1}`
      map.set(task.id, taskDisplay)

      const subtasks = phase.tasks.filter((t) => t.parentId === task.id)
      subtasks.forEach((subtask, subtaskIdx) => {
        map.set(subtask.id, `${taskDisplay}.${subtaskIdx + 1}`)
      })
    })
  }

  return map
}
