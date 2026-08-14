import { normalizePhasesProgress } from '@/lib/phase-progress'
import type { Phase, Task } from '@/types/roadmap'

function indexServerTasks(phases: Phase[]): Map<string, Task> {
  const tasks = new Map<string, Task>()
  for (const phase of phases) {
    for (const task of phase.tasks) tasks.set(task.id, task)
  }
  return tasks
}

/**
 * Rebase authoritative task-scoped server changes onto the current local
 * roadmap without replacing unrelated local edits.
 *
 * Returns null when any requested task is missing from either side. In that
 * case the caller must not advance its server revision because it cannot prove
 * that the authoritative change was applied locally.
 */
export function mergeAuthoritativeTasksIntoLocalPhases(
  localPhases: Phase[],
  serverPhases: Phase[],
  taskIds: Iterable<string>,
): Phase[] | null {
  const requestedIds = new Set(taskIds)
  if (requestedIds.size === 0) return null

  const serverTasks = indexServerTasks(serverPhases)
  const localTaskIds = new Set(localPhases.flatMap((phase) => phase.tasks.map((task) => task.id)))

  for (const taskId of requestedIds) {
    if (!serverTasks.has(taskId) || !localTaskIds.has(taskId)) return null
  }

  const nextPhases = localPhases.map((phase) => ({
    ...phase,
    tasks: phase.tasks.map((task) => {
      if (!requestedIds.has(task.id)) return task
      const authoritativeTask = serverTasks.get(task.id)
      return authoritativeTask ? { ...authoritativeTask } : task
    }),
  }))

  return normalizePhasesProgress(nextPhases)
}
