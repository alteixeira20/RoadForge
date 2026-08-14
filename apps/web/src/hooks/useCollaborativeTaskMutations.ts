'use client'

import { useCallback, useMemo, useRef } from 'react'
import { createInteractiveTaskId } from '@/lib/task-id'
import { useTaskMutations } from '@/hooks/useTaskMutations'
import { useTaskStructureSync } from '@/hooks/useTaskStructureSync'
import type { ActivityChange, Phase, Task } from '@/types/roadmap'

type BaseParams = Parameters<typeof useTaskMutations>[0]
type BaseResult = ReturnType<typeof useTaskMutations>

type StructuralHandlerName =
  | 'handleAddTask'
  | 'handleAddSubtask'
  | 'handleDeleteSubtask'
  | 'handleReorderTasks'
  | 'handleReorderSubtasks'
  | 'handleLinkDependency'
  | 'handleUnlinkDependency'

interface CollaborativeTaskRuntime {
  sessionToken: string | null
  updatedAt: string | null
  setUpdatedAt: (updatedAt: string) => void
  showToast: (message: string) => void
  onFocusedSuccess: () => void
  onSessionExpired: () => void
  beginFocusedWrite: () => void
  endFocusedWrite: () => void
}

interface CapturedMutation {
  phases: Phase[] | null
  activities: ActivityChange[]
}

function allTasks(phases: Phase[]): Task[] {
  return phases.flatMap((phase) => phase.tasks)
}

function newTaskFrom(before: Phase[], after: Phase[]): { phaseId: string; task: Task } | null {
  const beforeIds = new Set(allTasks(before).map((task) => task.id))
  for (const phase of after) {
    const task = phase.tasks.find((candidate) => !beforeIds.has(candidate.id))
    if (task) return { phaseId: phase.id, task }
  }
  return null
}

function replaceTaskIdentity(task: Task, id: string): Task {
  return { ...task, id }
}

function remapActivityTaskId(
  change: ActivityChange,
  previousTaskId: string,
  nextTaskId: string,
): ActivityChange {
  const mapped = { ...change } as ActivityChange & Record<string, unknown>
  for (const key of ['entity_id', 'taskId'] as const) {
    if (mapped[key] === previousTaskId) mapped[key] = nextTaskId
  }
  return mapped
}

function activityField(change: ActivityChange | undefined, key: string): string | null {
  if (!change) return null
  const value = (change as ActivityChange & Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function stringArrayArg(args: unknown[]): string[] | null {
  const found = args.find((arg) => Array.isArray(arg) && arg.every((item) => typeof item === 'string'))
  return found ? [...found] as string[] : null
}

function firstTaskIdArg(args: unknown[], phases: Phase[]): string | null {
  const ids = new Set(allTasks(phases).map((task) => task.id))
  return args.find((arg): arg is string => typeof arg === 'string' && ids.has(arg)) ?? null
}

function firstPhaseIdArg(args: unknown[], phases: Phase[]): string | null {
  const ids = new Set(phases.map((phase) => phase.id))
  return args.find((arg): arg is string => typeof arg === 'string' && ids.has(arg)) ?? null
}

function phaseForTask(phases: Phase[], taskId: string | null): string | null {
  if (!taskId) return null
  return phases.find((phase) => phase.tasks.some((task) => task.id === taskId))?.id ?? null
}

function dependencyPairFromActivity(
  activity: ActivityChange | undefined,
  args: unknown[],
  phases: Phase[],
): { taskId: string; dependencyId: string } | null {
  const taskId = activityField(activity, 'taskId')
    ?? activityField(activity, 'entity_id')
    ?? firstTaskIdArg(args, phases)
  const dependencyId = activityField(activity, 'dependencyId')
    ?? args.find((arg): arg is string => (
      typeof arg === 'string'
      && arg !== taskId
      && allTasks(phases).some((task) => task.id === arg)
    ))
    ?? null
  return taskId && dependencyId ? { taskId, dependencyId } : null
}

/**
 * Keep the established local task mutation hook as the semantic source of truth
 * while routing only shared structural intents through server-authoritative APIs.
 *
 * A second side-effect-suppressed hook instance captures what the existing local
 * handler would have produced. That preserves RoadForge's current defaults,
 * `very_high` guards, activity shape, and handler signatures without duplicating
 * the domain rules in this collaboration adapter.
 */
export function useCollaborativeTaskMutations(
  params: BaseParams,
  runtime: CollaborativeTaskRuntime,
): BaseResult & { waitForTaskReady: ReturnType<typeof useTaskStructureSync>['waitForTaskReady'] } {
  const base = useTaskMutations(params)
  const captureRef = useRef<CapturedMutation>({ phases: null, activities: [] })

  const captureParams = useMemo(() => ({
    ...params,
    serverRoadmapId: null,
    sessionToken: null,
    readOnly: false,
    setPhases: (next: Phase[]) => {
      captureRef.current.phases = next
    },
    setSaved: () => undefined,
    addPendingActivityChange: (change: ActivityChange) => {
      captureRef.current.activities.push(change)
    },
  } as BaseParams), [params])
  const capture = useTaskMutations(captureParams)

  const structure = useTaskStructureSync({
    phases: params.phases,
    setPhases: params.setPhases,
    setSaved: params.setSaved,
    serverRoadmapId: params.serverRoadmapId,
    sessionToken: runtime.sessionToken,
    updatedAt: runtime.updatedAt,
    setUpdatedAt: runtime.setUpdatedAt,
    showToast: runtime.showToast,
    onSuccess: runtime.onFocusedSuccess,
    onSessionExpired: runtime.onSessionExpired,
    beginFocusedWrite: runtime.beginFocusedWrite,
    endFocusedWrite: runtime.endFocusedWrite,
  })

  const captureMutation = useCallback(<K extends StructuralHandlerName>(
    name: K,
    args: Parameters<BaseResult[K]>,
  ): { captured: CapturedMutation; result: ReturnType<BaseResult[K]> } => {
    captureRef.current = { phases: null, activities: [] }
    const handler = capture[name] as (...handlerArgs: Parameters<BaseResult[K]>) => ReturnType<BaseResult[K]>
    const result = handler(...args)
    return {
      captured: {
        phases: captureRef.current.phases,
        activities: [...captureRef.current.activities],
      },
      result,
    }
  }, [capture])

  const replayActivities = useCallback((activities: ActivityChange[]) => {
    for (const activity of activities) params.addPendingActivityChange(activity)
  }, [params])

  const handleAddTask = useCallback((...args: Parameters<BaseResult['handleAddTask']>) => {
    if (!params.serverRoadmapId || !runtime.sessionToken) return base.handleAddTask(...args)
    const { captured, result } = captureMutation('handleAddTask', args)
    if (!captured.phases) return base.handleAddTask(...args)
    const created = newTaskFrom(params.phases, captured.phases)
    if (!created) return result

    const id = createInteractiveTaskId()
    const task = replaceTaskIdentity(created.task, id)
    const activities = captured.activities.map((change) => (
      remapActivityTaskId(change, created.task.id, id)
    ))
    const handled = structure.createSyncedTask(created.phaseId, task, {
      onAggregateFallback: () => replayActivities(activities),
    })
    if (!handled) return base.handleAddTask(...args)
    return (typeof result === 'string' && result === created.task.id ? id : result) as ReturnType<BaseResult['handleAddTask']>
  }, [
    base,
    captureMutation,
    params.phases,
    params.serverRoadmapId,
    replayActivities,
    runtime.sessionToken,
    structure,
  ]) as BaseResult['handleAddTask']

  const handleAddSubtask = useCallback((...args: Parameters<BaseResult['handleAddSubtask']>) => {
    if (!params.serverRoadmapId || !runtime.sessionToken) return base.handleAddSubtask(...args)
    const { captured, result } = captureMutation('handleAddSubtask', args)
    if (!captured.phases) return base.handleAddSubtask(...args)
    const created = newTaskFrom(params.phases, captured.phases)
    if (!created) return result

    const id = createInteractiveTaskId()
    const task = replaceTaskIdentity(created.task, id)
    const activities = captured.activities.map((change) => (
      remapActivityTaskId(change, created.task.id, id)
    ))
    const handled = structure.createSyncedTask(created.phaseId, task, {
      onAggregateFallback: () => replayActivities(activities),
    })
    if (!handled) return base.handleAddSubtask(...args)
    return (typeof result === 'string' && result === created.task.id ? id : result) as ReturnType<BaseResult['handleAddSubtask']>
  }, [
    base,
    captureMutation,
    params.phases,
    params.serverRoadmapId,
    replayActivities,
    runtime.sessionToken,
    structure,
  ]) as BaseResult['handleAddSubtask']

  const handleDeleteSubtask = useCallback((...args: Parameters<BaseResult['handleDeleteSubtask']>) => {
    if (!params.serverRoadmapId || !runtime.sessionToken) return base.handleDeleteSubtask(...args)
    const { captured, result } = captureMutation('handleDeleteSubtask', args)
    if (!captured.phases) return base.handleDeleteSubtask(...args)
    const activity = captured.activities.find((change) => change.action === 'task.deleted')
    const taskId = activityField(activity, 'taskId')
      ?? activityField(activity, 'entity_id')
      ?? firstTaskIdArg(args, params.phases)
    if (!taskId) return result
    const handled = structure.deleteSyncedTask(taskId, {
      onAggregateFallback: () => replayActivities(captured.activities),
    })
    if (!handled) return base.handleDeleteSubtask(...args)
    return result
  }, [
    base,
    captureMutation,
    params.phases,
    params.serverRoadmapId,
    replayActivities,
    runtime.sessionToken,
    structure,
  ]) as BaseResult['handleDeleteSubtask']

  const handleReorderTasks = useCallback((...args: Parameters<BaseResult['handleReorderTasks']>) => {
    if (!params.serverRoadmapId || !runtime.sessionToken) return base.handleReorderTasks(...args)
    const { captured, result } = captureMutation('handleReorderTasks', args)
    if (!captured.phases) return base.handleReorderTasks(...args)
    const activity = captured.activities.find((change) => change.action === 'task.reordered')
    const taskIds = stringArrayArg(args)
    const phaseId = activityField(activity, 'phaseId')
      ?? firstPhaseIdArg(args, params.phases)
      ?? phaseForTask(params.phases, taskIds?.[0] ?? null)
    if (!taskIds || !phaseId) return result
    const handled = structure.reorderSyncedTasks(phaseId, taskIds, {
      onAggregateFallback: () => replayActivities(captured.activities),
    })
    if (!handled) return base.handleReorderTasks(...args)
    return result
  }, [
    base,
    captureMutation,
    params.phases,
    params.serverRoadmapId,
    replayActivities,
    runtime.sessionToken,
    structure,
  ]) as BaseResult['handleReorderTasks']

  const handleReorderSubtasks = useCallback((...args: Parameters<BaseResult['handleReorderSubtasks']>) => {
    if (!params.serverRoadmapId || !runtime.sessionToken) return base.handleReorderSubtasks(...args)
    const { captured, result } = captureMutation('handleReorderSubtasks', args)
    if (!captured.phases) return base.handleReorderSubtasks(...args)
    const activity = captured.activities.find((change) => change.action === 'task.reordered')
    const taskIds = stringArrayArg(args)
    const parentId = activityField(activity, 'taskId')
      ?? activityField(activity, 'entity_id')
      ?? firstTaskIdArg(args, params.phases)
    if (!taskIds || !parentId) return result
    const handled = structure.reorderSyncedSubtasks(parentId, taskIds, {
      onAggregateFallback: () => replayActivities(captured.activities),
    })
    if (!handled) return base.handleReorderSubtasks(...args)
    return result
  }, [
    base,
    captureMutation,
    params.phases,
    params.serverRoadmapId,
    replayActivities,
    runtime.sessionToken,
    structure,
  ]) as BaseResult['handleReorderSubtasks']

  const buildDependencyHandler = useCallback((
    name: 'handleLinkDependency' | 'handleUnlinkDependency',
    linked: boolean,
  ) => ((...args: Parameters<BaseResult[typeof name]>) => {
    if (!params.serverRoadmapId || !runtime.sessionToken) {
      const handler = base[name] as (...handlerArgs: typeof args) => ReturnType<BaseResult[typeof name]>
      return handler(...args)
    }
    const { captured, result } = captureMutation(name, args)
    if (!captured.phases) return result
    const activity = captured.activities.find((change) => (
      change.action === (linked ? 'task.dependency.linked' : 'task.dependency.unlinked')
    ))
    const pair = dependencyPairFromActivity(activity, args, params.phases)
    if (!pair) return result
    const handled = structure.setSyncedDependency(pair.taskId, pair.dependencyId, linked, {
      onAggregateFallback: () => replayActivities(captured.activities),
    })
    if (!handled) {
      const handler = base[name] as (...handlerArgs: typeof args) => ReturnType<BaseResult[typeof name]>
      return handler(...args)
    }
    return result
  }), [
    base,
    captureMutation,
    params.phases,
    params.serverRoadmapId,
    replayActivities,
    runtime.sessionToken,
    structure,
  ])

  const handleLinkDependency = useMemo(
    () => buildDependencyHandler('handleLinkDependency', true) as BaseResult['handleLinkDependency'],
    [buildDependencyHandler],
  )
  const handleUnlinkDependency = useMemo(
    () => buildDependencyHandler('handleUnlinkDependency', false) as BaseResult['handleUnlinkDependency'],
    [buildDependencyHandler],
  )

  return {
    ...base,
    handleAddTask,
    handleAddSubtask,
    handleDeleteSubtask,
    handleReorderTasks,
    handleReorderSubtasks,
    handleLinkDependency,
    handleUnlinkDependency,
    waitForTaskReady: structure.waitForTaskReady,
  }
}
