import { normalizePhasesProgress } from '@/lib/phase-progress'
import type { Phase, Task } from '@/types/roadmap'

function childrenByParent(tasks: Task[]): Map<string, string[]> {
  const children = new Map<string, string[]>()
  for (const task of tasks) {
    if (!task.parentId) continue
    const siblings = children.get(task.parentId) ?? []
    siblings.push(task.id)
    children.set(task.parentId, siblings)
  }
  return children
}

export function descendantTaskIds(tasks: Task[], rootId: string): Set<string> {
  const children = childrenByParent(tasks)
  const descendants = new Set<string>()
  const pending = [...(children.get(rootId) ?? [])]
  while (pending.length > 0) {
    const taskId = pending.pop()!
    if (descendants.has(taskId)) continue
    descendants.add(taskId)
    pending.push(...(children.get(taskId) ?? []))
  }
  return descendants
}

function taskSubtreeBlock(tasks: Task[], rootId: string): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  if (!byId.has(rootId)) return []
  const children = childrenByParent(tasks)
  const ordered: Task[] = []

  const visit = (taskId: string) => {
    const task = byId.get(taskId)
    if (!task) return
    ordered.push(task)
    for (const childId of children.get(taskId) ?? []) visit(childId)
  }

  visit(rootId)
  return ordered
}

function preferredKnownOrder(currentIds: string[], requestedIds: string[]): string[] {
  const current = new Set(currentIds)
  const requestedKnown = requestedIds.filter((taskId) => current.has(taskId))
  const requested = new Set(requestedKnown)
  return [
    ...requestedKnown,
    ...currentIds.filter((taskId) => !requested.has(taskId)),
  ]
}

function replacePhaseTasks(phases: Phase[], phaseId: string, tasks: Task[]): Phase[] {
  return normalizePhasesProgress(phases.map((phase) => (
    phase.id === phaseId ? { ...phase, tasks } : phase
  )))
}

export function addTaskToPhase(phases: Phase[], phaseId: string, task: Task): Phase[] {
  return normalizePhasesProgress(phases.map((phase) => {
    if (phase.id !== phaseId) return phase
    if (phase.tasks.some((candidate) => candidate.id === task.id)) return phase
    if (!task.parentId) return { ...phase, tasks: [...phase.tasks, task] }

    const parentIndex = phase.tasks.findIndex((candidate) => candidate.id === task.parentId)
    if (parentIndex < 0) return phase
    const tasks = [...phase.tasks]
    tasks.splice(parentIndex + 1, 0, task)
    return { ...phase, tasks }
  }))
}

export function removeTaskSubtreeAndDependencies(phases: Phase[], taskId: string): Phase[] {
  const sourcePhase = phases.find((phase) => phase.tasks.some((task) => task.id === taskId))
  if (!sourcePhase) return phases
  const deletedIds = new Set([taskId, ...descendantTaskIds(sourcePhase.tasks, taskId)])

  return normalizePhasesProgress(phases.map((phase) => ({
    ...phase,
    tasks: phase.tasks
      .filter((task) => !deletedIds.has(task.id))
      .map((task) => {
        if (!task.deps?.some((dependencyId) => deletedIds.has(dependencyId))) return task
        return {
          ...task,
          deps: task.deps.filter((dependencyId) => !deletedIds.has(dependencyId)),
        }
      }),
  })))
}

export function orderTopLevelTasksByPreference(
  phases: Phase[],
  phaseId: string,
  taskIds: string[],
): Phase[] {
  const phase = phases.find((candidate) => candidate.id === phaseId)
  if (!phase) return phases
  const topLevelIds = phase.tasks.filter((task) => !task.parentId).map((task) => task.id)
  const finalIds = preferredKnownOrder(topLevelIds, taskIds)
  const ordered: Task[] = []
  const handled = new Set<string>()

  for (const taskId of finalIds) {
    const block = taskSubtreeBlock(phase.tasks, taskId)
    ordered.push(...block)
    block.forEach((task) => handled.add(task.id))
  }
  ordered.push(...phase.tasks.filter((task) => !handled.has(task.id)))
  return replacePhaseTasks(phases, phaseId, ordered)
}

export function orderDirectSubtasksByPreference(
  phases: Phase[],
  parentId: string,
  taskIds: string[],
): Phase[] {
  const phase = phases.find((candidate) => candidate.tasks.some((task) => task.id === parentId))
  if (!phase) return phases
  const directIds = phase.tasks
    .filter((task) => task.parentId === parentId)
    .map((task) => task.id)
  const finalIds = preferredKnownOrder(directIds, taskIds)
  const subtreeIds = new Set<string>()
  const orderedChildren: Task[] = []

  for (const taskId of finalIds) {
    const block = taskSubtreeBlock(phase.tasks, taskId)
    orderedChildren.push(...block)
    block.forEach((task) => subtreeIds.add(task.id))
  }

  const withoutChildren = phase.tasks.filter((task) => !subtreeIds.has(task.id))
  const parentIndex = withoutChildren.findIndex((task) => task.id === parentId)
  if (parentIndex < 0) return phases
  const nextTasks = [...withoutChildren]
  nextTasks.splice(parentIndex + 1, 0, ...orderedChildren)
  return replacePhaseTasks(phases, phase.id, nextTasks)
}

export function setLocalTaskDependency(
  phases: Phase[],
  taskId: string,
  dependencyId: string,
  linked: boolean,
): Phase[] {
  return phases.map((phase) => ({
    ...phase,
    tasks: phase.tasks.map((task) => {
      if (task.id !== taskId) return task
      const deps = task.deps ?? []
      if (linked) {
        if (deps.includes(dependencyId)) return task
        return { ...task, deps: [...deps, dependencyId] }
      }
      if (!deps.includes(dependencyId)) return task
      return { ...task, deps: deps.filter((candidate) => candidate !== dependencyId) }
    }),
  }))
}

export function mergeCreatedTaskAcknowledgement(
  localPhases: Phase[],
  serverPhases: Phase[],
  taskId: string,
): Phase[] | null {
  const serverPhase = serverPhases.find((phase) => phase.tasks.some((task) => task.id === taskId))
  if (!serverPhase) return null
  const serverTask = serverPhase.tasks.find((task) => task.id === taskId)!
  const localTask = localPhases.flatMap((phase) => phase.tasks).find((task) => task.id === taskId)
  let nextPhases = localPhases

  if (!localTask) {
    nextPhases = addTaskToPhase(localPhases, serverPhase.id, serverTask)
  } else if (localTask.parentId !== serverTask.parentId) {
    nextPhases = localPhases.map((phase) => ({
      ...phase,
      tasks: phase.tasks.map((task) => (
        task.id === taskId ? { ...task, parentId: serverTask.parentId } : task
      )),
    }))
  }

  const serverOrder = serverPhase.tasks.map((task) => task.id)
  const phase = nextPhases.find((candidate) => candidate.id === serverPhase.id)
  if (!phase) return null
  const ordered = preferredKnownOrder(phase.tasks.map((task) => task.id), serverOrder)
  const byId = new Map(phase.tasks.map((task) => [task.id, task]))
  return replacePhaseTasks(
    nextPhases,
    serverPhase.id,
    ordered.map((id) => byId.get(id)!).filter(Boolean),
  )
}

export function mergeTaskDependencyAcknowledgement(
  localPhases: Phase[],
  serverPhases: Phase[],
  taskId: string,
): Phase[] | null {
  const serverTask = serverPhases.flatMap((phase) => phase.tasks).find((task) => task.id === taskId)
  const localTaskExists = localPhases.some((phase) => phase.tasks.some((task) => task.id === taskId))
  if (!serverTask || !localTaskExists) return null
  return localPhases.map((phase) => ({
    ...phase,
    tasks: phase.tasks.map((task) => (
      task.id === taskId ? { ...task, deps: [...(serverTask.deps ?? [])] } : task
    )),
  }))
}

export function restoreDeletedTaskSubtree(
  currentPhases: Phase[],
  beforeDelete: Phase[],
  taskId: string,
): Phase[] {
  const beforePhase = beforeDelete.find((phase) => phase.tasks.some((task) => task.id === taskId))
  if (!beforePhase) return currentPhases
  const deletedIds = new Set([taskId, ...descendantTaskIds(beforePhase.tasks, taskId)])
  const deletedTasks = beforePhase.tasks.filter((task) => deletedIds.has(task.id))
  const beforeById = new Map(beforeDelete.flatMap((phase) => phase.tasks).map((task) => [task.id, task]))

  let nextPhases = currentPhases.map((phase) => ({
    ...phase,
    tasks: phase.tasks.map((task) => {
      const before = beforeById.get(task.id)
      if (!before?.deps?.length) return task
      const removedDeps = before.deps.filter((dependencyId) => deletedIds.has(dependencyId))
      if (removedDeps.length === 0) return task
      const currentDeps = task.deps ?? []
      const restored = [...currentDeps]
      for (const dependencyId of removedDeps) {
        if (!restored.includes(dependencyId)) restored.push(dependencyId)
      }
      return { ...task, deps: restored }
    }),
  }))

  const target = nextPhases.find((phase) => phase.id === beforePhase.id)
  if (!target) return currentPhases
  const existingIds = new Set(target.tasks.map((task) => task.id))
  nextPhases = replacePhaseTasks(
    nextPhases,
    beforePhase.id,
    [...target.tasks, ...deletedTasks.filter((task) => !existingIds.has(task.id))],
  )

  const preferred = beforePhase.tasks.map((task) => task.id)
  const restoredPhase = nextPhases.find((phase) => phase.id === beforePhase.id)!
  const order = preferredKnownOrder(restoredPhase.tasks.map((task) => task.id), preferred)
  const byId = new Map(restoredPhase.tasks.map((task) => [task.id, task]))
  return replacePhaseTasks(
    nextPhases,
    beforePhase.id,
    order.map((id) => byId.get(id)!).filter(Boolean),
  )
}
