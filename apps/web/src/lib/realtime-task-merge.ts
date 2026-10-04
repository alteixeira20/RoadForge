import { computePhaseProgress } from '@/lib/phase-progress'
import type { Phase, Task } from '@/types/roadmap'

function indexServerTasks(phases: Phase[]): Map<string, Task> {
  const tasks = new Map<string, Task>()
  for (const phase of phases) {
    for (const task of phase.tasks) tasks.set(task.id, task)
  }
  return tasks
}

function areFieldValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, i) => {
      const bItem = b[i]
      if (item === bItem) return true
      if (typeof item === 'object' && item !== null && typeof bItem === 'object' && bItem !== null) {
        return JSON.stringify(item) === JSON.stringify(bItem)
      }
      return false
    })
  }
  return false
}

function mergeTaskWithFields(
  localTask: Task,
  serverTask: Task,
  fields: ReadonlySet<string> | undefined,
): Task {
  if (!fields || fields.size === 0) {
    let anyDifference = false
    for (const key of Object.keys(serverTask) as Array<keyof Task>) {
      if (!areFieldValuesEqual(localTask[key], serverTask[key])) {
        anyDifference = true
        break
      }
    }
    if (!anyDifference) {
      for (const key of Object.keys(localTask) as Array<keyof Task>) {
        if (!(key in serverTask)) {
          anyDifference = true
          break
        }
      }
    }
    return anyDifference ? { ...serverTask } : localTask
  }

  let fieldChanged = false
  const updated = { ...localTask }
  for (const field of fields) {
    const serverVal = serverTask[field as keyof Task]
    const localVal = localTask[field as keyof Task]
    if (!areFieldValuesEqual(localVal, serverVal)) {
      fieldChanged = true
      if (serverVal === undefined) {
        delete updated[field as keyof Task]
      } else {
        (updated as Record<string, unknown>)[field] = serverVal
      }
    }
  }
  return fieldChanged ? updated : localTask
}

/**
 * Rebase authoritative task-scoped server changes onto the current local
 * roadmap without replacing unrelated local edits.
 *
 * When specific fields are provided for a task, only those fields are updated,
 * keeping uncommitted local drafts on other fields authoritative.
 *
 * Preserves object identity for unchanged phases and tasks.
 *
 * Returns null when any requested task is missing from either side. In that
 * case the caller must not advance its server revision because it cannot prove
 * that the authoritative change was applied locally.
 */
export function mergeAuthoritativeTasksIntoLocalPhases(
  localPhases: Phase[],
  serverPhases: Phase[],
  taskIds: Iterable<string>,
  taskFields?: ReadonlyMap<string, ReadonlySet<string>>,
): Phase[] | null {
  const requestedIds = new Set(taskIds)
  if (requestedIds.size === 0) return null

  const serverTasks = indexServerTasks(serverPhases)
  const localTaskIds = new Set(localPhases.flatMap((phase) => phase.tasks.map((task) => task.id)))

  for (const taskId of requestedIds) {
    if (!serverTasks.has(taskId) || !localTaskIds.has(taskId)) return null
  }

  let anyPhaseChanged = false
  const nextPhases = localPhases.map((phase) => {
    const hasRequestedTask = phase.tasks.some((task) => requestedIds.has(task.id))
    if (!hasRequestedTask) return phase

    let anyTaskInPhaseChanged = false
    const nextTasks = phase.tasks.map((task) => {
      if (!requestedIds.has(task.id)) return task
      const authoritativeTask = serverTasks.get(task.id)
      if (!authoritativeTask) return task

      const fields = taskFields?.get(task.id)
      const mergedTask = mergeTaskWithFields(task, authoritativeTask, fields)
      if (mergedTask !== task) {
        anyTaskInPhaseChanged = true
      }
      return mergedTask
    })

    const newProgress = computePhaseProgress({ ...phase, tasks: nextTasks })
    const progressChanged = phase.progress !== newProgress

    if (!anyTaskInPhaseChanged && !progressChanged) {
      return phase
    }

    anyPhaseChanged = true
    return {
      ...phase,
      tasks: anyTaskInPhaseChanged ? nextTasks : phase.tasks,
      progress: newProgress,
    }
  })

  return anyPhaseChanged ? nextPhases : localPhases
}
