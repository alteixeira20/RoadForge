import { normalizePhasesProgress } from '@/lib/phase-progress'
import {
  addTaskToPhase,
  orderDirectSubtasksByPreference,
  orderTopLevelTasksByPreference,
} from '@/lib/task-structure-merge'
import type { Phase, Task } from '@/types/roadmap'

export interface RealtimeTaskOrderScope {
  phaseId: string
  parentId: string | null
}

function withoutParent(task: Task): Task {
  const nextTask = { ...task }
  delete nextTask.parentId
  return nextTask
}

function withoutDeletedTasks(
  phases: Phase[],
  deletedTaskIds: ReadonlySet<string>,
): Phase[] {
  if (deletedTaskIds.size === 0) return phases

  return normalizePhasesProgress(phases.map((phase) => ({
    ...phase,
    tasks: phase.tasks
      .filter((task) => !deletedTaskIds.has(task.id))
      .map((task) => {
        const nextDeps = (task.deps ?? []).filter((taskId) => !deletedTaskIds.has(taskId))
        const parentDeleted = task.parentId ? deletedTaskIds.has(task.parentId) : false
        if (!parentDeleted && nextDeps.length === (task.deps ?? []).length) return task

        const nextTask = parentDeleted ? withoutParent(task) : task
        return nextDeps.length === (task.deps ?? []).length
          ? nextTask
          : { ...nextTask, deps: nextDeps }
      }),
  })))
}

function taskLocation(
  phases: Phase[],
  taskId: string,
): { phase: Phase; task: Task } | null {
  for (const phase of phases) {
    const task = phase.tasks.find((candidate) => candidate.id === taskId)
    if (task) return { phase, task }
  }
  return null
}

function withAuthoritativeParent(localTask: Task, serverTask: Task): Task {
  if (localTask.parentId === serverTask.parentId) return localTask
  if (serverTask.parentId) return { ...localTask, parentId: serverTask.parentId }
  return withoutParent(localTask)
}

function mergeCreatedTask(
  localPhases: Phase[],
  serverPhases: Phase[],
  taskId: string,
): Phase[] | null {
  const serverLocation = taskLocation(serverPhases, taskId)
  // A create followed by a delete may be coalesced into the same refresh. The
  // final authoritative snapshot wins, so an absent created ID is obsolete.
  if (!serverLocation) return localPhases

  const localLocation = taskLocation(localPhases, taskId)
  if (localLocation) {
    if (localLocation.phase.id !== serverLocation.phase.id) return null
    const nextTask = withAuthoritativeParent(localLocation.task, serverLocation.task)
    if (nextTask === localLocation.task) return localPhases
    return normalizePhasesProgress(localPhases.map((phase) => ({
      ...phase,
      tasks: phase.tasks.map((task) => task.id === taskId ? nextTask : task),
    })))
  }

  if (!localPhases.some((phase) => phase.id === serverLocation.phase.id)) return null
  const nextPhases = addTaskToPhase(localPhases, serverLocation.phase.id, serverLocation.task)
  return taskLocation(nextPhases, taskId) ? nextPhases : null
}

function applyAuthoritativeOrder(
  phases: Phase[],
  serverPhases: Phase[],
  scope: RealtimeTaskOrderScope,
): Phase[] | null {
  const serverPhase = serverPhases.find((phase) => phase.id === scope.phaseId)
  const localPhase = phases.find((phase) => phase.id === scope.phaseId)

  // A reordered phase may have been deleted by a later event in the same
  // burst. If both snapshots agree it is gone, this order scope is obsolete.
  if (!serverPhase && !localPhase) return phases
  if (!serverPhase || !localPhase) return null

  if (scope.parentId === null) {
    const taskIds = serverPhase.tasks
      .filter((task) => !task.parentId)
      .map((task) => task.id)
    return orderTopLevelTasksByPreference(phases, scope.phaseId, taskIds)
  }

  const serverParent = serverPhase.tasks.find((task) => task.id === scope.parentId)
  const localParent = localPhase.tasks.find((task) => task.id === scope.parentId)
  if (!serverParent && !localParent) return phases
  if (!serverParent || !localParent) return null

  const taskIds = serverPhase.tasks
    .filter((task) => task.parentId === scope.parentId)
    .map((task) => task.id)
  return orderDirectSubtasksByPreference(phases, scope.parentId, taskIds)
}

/**
 * Rebase server-authoritative task *structure* onto a dirty local draft.
 *
 * Only structure proven by realtime metadata is authoritative here:
 * - explicitly deleted server IDs are removed, including dangling deps;
 * - explicitly created IDs are added without overwriting unrelated local fields;
 * - affected sibling scopes adopt the final server ordering as a preference.
 *
 * Local-only pending tasks and dirty fields on existing tasks are preserved.
 * This intentionally differs from whole-snapshot replacement, which is unsafe
 * while the local roadmap has unsaved work.
 */
export function mergeAuthoritativeTaskStructureIntoLocalPhases(
  localPhases: Phase[],
  serverPhases: Phase[],
  createdTaskIds: ReadonlySet<string>,
  deletedTaskIds: ReadonlySet<string>,
  orderScopes: ReadonlyMap<string, RealtimeTaskOrderScope>,
): Phase[] | null {
  const finalServerTaskIds = new Set(
    serverPhases.flatMap((phase) => phase.tasks.map((task) => task.id)),
  )
  const effectiveDeletedTaskIds = new Set(
    [...deletedTaskIds].filter((taskId) => !finalServerTaskIds.has(taskId)),
  )

  let nextPhases = withoutDeletedTasks(localPhases, effectiveDeletedTaskIds)

  for (const taskId of createdTaskIds) {
    const merged = mergeCreatedTask(nextPhases, serverPhases, taskId)
    if (!merged) return null
    nextPhases = merged
  }

  for (const scope of orderScopes.values()) {
    const ordered = applyAuthoritativeOrder(nextPhases, serverPhases, scope)
    if (!ordered) return null
    nextPhases = ordered
  }

  return normalizePhasesProgress(nextPhases)
}
