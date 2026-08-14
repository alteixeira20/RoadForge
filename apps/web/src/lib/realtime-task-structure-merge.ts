import { normalizePhasesProgress } from '@/lib/phase-progress'
import {
  addTaskToPhase,
  orderDirectSubtasksByPreference,
  orderTopLevelTasksByPreference,
} from '@/lib/task-structure-merge'
import type { Phase, Task } from '@/types/roadmap'

interface TaskLocation {
  phaseId: string
  task: Task
}

function indexTasks(phases: Phase[]): Map<string, TaskLocation> {
  const tasks = new Map<string, TaskLocation>()
  for (const phase of phases) {
    for (const task of phase.tasks) {
      tasks.set(task.id, { phaseId: phase.id, task })
    }
  }
  return tasks
}

function removeExactTasksAndDependencies(
  phases: Phase[],
  removedIds: ReadonlySet<string>,
): Phase[] {
  if (removedIds.size === 0) return phases
  return normalizePhasesProgress(phases.map((phase) => ({
    ...phase,
    tasks: phase.tasks
      .filter((task) => !removedIds.has(task.id))
      .map((task) => {
        if (!task.deps?.some((dependencyId) => removedIds.has(dependencyId))) return task
        return {
          ...task,
          deps: task.deps.filter((dependencyId) => !removedIds.has(dependencyId)),
        }
      }),
  })))
}

function removeTaskIdentity(phases: Phase[], taskId: string): Phase[] {
  return phases.map((phase) => ({
    ...phase,
    tasks: phase.tasks.filter((task) => task.id !== taskId),
  }))
}

/**
 * Rebase final authoritative task existence and peer ordering onto a dirty
 * local roadmap without replacing unrelated local task/phase fields.
 *
 * The authoritative GET is final truth. Affected IDs absent from that GET are
 * removed exactly (with dependency cleanup); affected IDs still present are
 * replaced only as those task entities. Top-level and direct-child order is
 * then applied as preferred-known order, so local-only pending creates remain
 * after server-known peers in their local relative order.
 */
export function mergeAuthoritativeTaskStructureIntoLocalPhases(
  localPhases: Phase[],
  serverPhases: Phase[],
  affectedTaskIds: ReadonlySet<string>,
  topLevelOrderPhaseIds: ReadonlySet<string>,
  childOrderParentIds: ReadonlySet<string>,
): Phase[] | null {
  const serverTasks = indexTasks(serverPhases)
  const finalAbsent = new Set(
    [...affectedTaskIds].filter((taskId) => !serverTasks.has(taskId)),
  )
  let nextPhases = removeExactTasksAndDependencies(localPhases, finalAbsent)

  // Insert/replace server-present affected tasks in canonical server flat order,
  // which is parent-before-child. This lets a parent+child create burst compose.
  for (const serverPhase of serverPhases) {
    for (const serverTask of serverPhase.tasks) {
      if (!affectedTaskIds.has(serverTask.id)) continue
      nextPhases = removeTaskIdentity(nextPhases, serverTask.id)
      nextPhases = addTaskToPhase(nextPhases, serverPhase.id, { ...serverTask })
      if (!nextPhases.some((phase) => phase.tasks.some((task) => task.id === serverTask.id))) {
        return null
      }
    }
  }

  for (const phaseId of topLevelOrderPhaseIds) {
    const serverPhase = serverPhases.find((phase) => phase.id === phaseId)
    const localPhase = nextPhases.find((phase) => phase.id === phaseId)
    if (!serverPhase || !localPhase) return null
    nextPhases = orderTopLevelTasksByPreference(
      nextPhases,
      phaseId,
      serverPhase.tasks.filter((task) => !task.parentId).map((task) => task.id),
    )
  }

  const finalServerTasks = indexTasks(serverPhases)
  for (const parentId of childOrderParentIds) {
    const serverParent = finalServerTasks.get(parentId)
    if (!serverParent) {
      if (affectedTaskIds.has(parentId)) continue
      return null
    }
    if (!nextPhases.some((phase) => phase.tasks.some((task) => task.id === parentId))) {
      return null
    }
    const serverPhase = serverPhases.find((phase) => phase.id === serverParent.phaseId)!
    nextPhases = orderDirectSubtasksByPreference(
      nextPhases,
      parentId,
      serverPhase.tasks
        .filter((task) => task.parentId === parentId)
        .map((task) => task.id),
    )
  }

  return normalizePhasesProgress(nextPhases)
}

/** Apply only authoritative dependency arrays, preserving all other dirty fields. */
export function mergeAuthoritativeTaskDependenciesIntoLocalPhases(
  localPhases: Phase[],
  serverPhases: Phase[],
  taskIds: Iterable<string>,
): Phase[] | null {
  const requested = new Set(taskIds)
  if (requested.size === 0) return null
  const serverTasks = indexTasks(serverPhases)
  const localTasks = indexTasks(localPhases)
  for (const taskId of requested) {
    if (!serverTasks.has(taskId) || !localTasks.has(taskId)) return null
  }

  return localPhases.map((phase) => ({
    ...phase,
    tasks: phase.tasks.map((task) => {
      if (!requested.has(task.id)) return task
      const serverTask = serverTasks.get(task.id)!.task
      return { ...task, deps: [...(serverTask.deps ?? [])] }
    }),
  }))
}

export function taskIdsInPhases(phases: Phase[]): Set<string> {
  return new Set(phases.flatMap((phase) => phase.tasks.map((task) => task.id)))
}
