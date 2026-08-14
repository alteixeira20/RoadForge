'use client'

import { useCallback, useRef } from 'react'
import { getChangedTaskFields } from '@/lib/activity-changes'
import { getTaskCompletionBlocker } from '@/lib/task-completion'
import { getTaskComplexity, getTaskComplexityStructureIssue } from '@/lib/task-complexity'
import { createInteractiveTaskId } from '@/lib/task-id'
import {
  addTaskToPhase,
  orderDirectSubtasksByPreference,
  orderTopLevelTasksByPreference,
  removeTaskSubtreeAndDependencies,
  setLocalTaskDependency,
} from '@/lib/task-structure-merge'
import { generateTaskId, generateSubtaskId, hasCycle as hasCycleGraph } from '@/lib/task-graph'
import { newestServerRevision } from '@/lib/server-revision'
import type { PatchTaskUpdates } from '@/services/roadmap-crud.service'
import type { ActivityChange, Phase, Task } from '@/types/roadmap'
import {
  buildTaskDoneActivityChanges,
  buildTaskDonePhases,
  findPhaseForTask,
  isPhaseComplete,
} from './taskMutationHelpers'
import { useTaskStructureSync, type TaskServerReadiness } from './useTaskStructureSync'

interface PatchSyncedTaskDoneParams {
  task: Task
  done: boolean
  nextPhases: Phase[]
  revertPhases: (taskId: string, done: boolean, phases: Phase[]) => Phase[]
  lastUpdatedAt?: string
}

interface PatchSyncedTaskParams {
  task: Task
  updates: PatchTaskUpdates
  lastUpdatedAt?: string
}

interface FocusedStructureOptions {
  onAggregateFallback: () => void
}

interface TaskStructureSyncAdapter {
  createSyncedTask: (
    phaseId: string,
    task: Task,
    options: FocusedStructureOptions,
  ) => boolean
  deleteSyncedTask: (taskId: string, options: FocusedStructureOptions) => boolean
  reorderSyncedTasks: (
    phaseId: string,
    taskIds: string[],
    options: FocusedStructureOptions,
  ) => boolean
  reorderSyncedSubtasks: (
    parentId: string,
    taskIds: string[],
    options: FocusedStructureOptions,
  ) => boolean
  setSyncedDependency: (
    taskId: string,
    dependencyId: string,
    linked: boolean,
    options: FocusedStructureOptions,
  ) => boolean
  waitForTaskReady: (taskId: string) => Promise<TaskServerReadiness>
  getLatestServerRevision: () => string | null
}

export interface CreateTaskMutationsParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  serverRoadmapId: string | null
  sessionToken: string | null
  updatedAt: string | null
  addActivity: (change: ActivityChange) => void
  showToast: (msg: string) => void
  setExpandedTaskId: (id: string) => void
  readOnly: boolean
  isTaskDonePatchInFlight: (taskId: string) => boolean
  patchSyncedTaskDone: (params: PatchSyncedTaskDoneParams) => Promise<boolean>
  patchSyncedTask: (params: PatchSyncedTaskParams) => Promise<boolean>
  taskStructure?: TaskStructureSyncAdapter
  getCurrentPhases?: () => Phase[]
}

export interface TaskMutations {
  hasCycle: (taskId: string, depId: string) => boolean
  onCheckTask: (id: string) => void
  handleAddTask: (phaseId: string, title?: string) => string
  handleAddSubtask: (parentId: string, title: string) => void
  handleDeleteSubtask: (subtaskId: string) => void
  handleUpdateTask: (id: string, updates: Partial<Task>) => Promise<boolean>
  handleLinkDependency: (taskId: string, depId: string) => void
  handleUnlinkDependency: (taskId: string, depId: string) => void
  handleReorderTasks: (phaseId: string, taskIds: string[]) => void
  handleReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
}

interface UseTaskMutationsRuntime {
  setUpdatedAt: (updatedAt: string) => void
  onFocusedSuccess: () => void
  onSessionExpired: () => void
  beginFocusedWrite: () => void
  endFocusedWrite: () => void
}

type ConnectedTaskParams = Omit<
  CreateTaskMutationsParams,
  'taskStructure' | 'getCurrentPhases'
>

/** Connected task mutation adapter. The plain factory below remains unit-testable. */
export function useTaskMutations(
  params: ConnectedTaskParams,
  runtime: UseTaskMutationsRuntime,
): TaskMutations {
  const phasesRef = useRef(params.phases)
  const revisionRef = useRef<string | null>(params.updatedAt)
  phasesRef.current = params.phases
  revisionRef.current = newestServerRevision(revisionRef.current, params.updatedAt)

  const setCurrentPhases = useCallback((nextPhases: Phase[]) => {
    phasesRef.current = nextPhases
    params.setPhases(nextPhases)
  }, [params.setPhases])

  const setCurrentUpdatedAt = useCallback((nextUpdatedAt: string) => {
    revisionRef.current = newestServerRevision(revisionRef.current, nextUpdatedAt)
    runtime.setUpdatedAt(nextUpdatedAt)
  }, [runtime.setUpdatedAt])

  const structure = useTaskStructureSync({
    phases: params.phases,
    setPhases: setCurrentPhases,
    setSaved: params.setSaved,
    serverRoadmapId: params.serverRoadmapId,
    sessionToken: params.sessionToken,
    updatedAt: params.updatedAt,
    setUpdatedAt: setCurrentUpdatedAt,
    showToast: params.showToast,
    onSuccess: runtime.onFocusedSuccess,
    onSessionExpired: runtime.onSessionExpired,
    beginFocusedWrite: runtime.beginFocusedWrite,
    endFocusedWrite: runtime.endFocusedWrite,
  })

  return createTaskMutations({
    ...params,
    setPhases: setCurrentPhases,
    getCurrentPhases: () => phasesRef.current,
    taskStructure: {
      ...structure,
      getLatestServerRevision: () => revisionRef.current,
    },
  })
}

function taskActivity(
  task: Task,
  phase: Phase | undefined,
  changedFields: string[],
  title: string,
): ActivityChange {
  return {
    action: 'task.updated',
    entity_type: 'task',
    entity_id: task.id,
    taskId: task.id,
    taskTitle: title,
    changedFields,
    phaseId: phase?.id,
    phaseName: phase?.name,
  }
}

export function createTaskMutations({
  phases,
  setPhases,
  setSaved,
  serverRoadmapId,
  sessionToken,
  updatedAt,
  addActivity,
  showToast,
  setExpandedTaskId,
  readOnly,
  isTaskDonePatchInFlight,
  patchSyncedTaskDone,
  patchSyncedTask,
  taskStructure,
  getCurrentPhases,
}: CreateTaskMutationsParams): TaskMutations {
  const currentPhases = (): Phase[] => getCurrentPhases?.() ?? phases
  const currentTasks = (): Task[] => currentPhases().flatMap((phase) => phase.tasks)
  const shared = Boolean(serverRoadmapId && sessionToken)

  const hasCycle = (taskId: string, depId: string): boolean =>
    hasCycleGraph(taskId, depId, currentTasks())

  const applyLocalDone = (task: Task, done: boolean, sourcePhases: Phase[]) => {
    const affectedPhase = findPhaseForTask(sourcePhases, task.id)
    const wasPhaseComplete = affectedPhase ? isPhaseComplete(affectedPhase) : false
    const nextPhases = buildTaskDonePhases(task.id, done, sourcePhases)
    setPhases(nextPhases)
    buildTaskDoneActivityChanges({
      task,
      affectedPhase,
      wasPhaseComplete,
      nextPhases,
    }).forEach(addActivity)
    setSaved(false)
  }

  const onCheckTask = (id: string) => {
    if (readOnly || isTaskDonePatchInFlight(id)) return

    void (async () => {
      let readiness: TaskServerReadiness = 'ready'
      if (shared && taskStructure) {
        readiness = await taskStructure.waitForTaskReady(id)
        if (readiness === 'absent') return
      }

      const latestPhases = currentPhases()
      const allTasks = latestPhases.flatMap((phase) => phase.tasks)
      const task = allTasks.find((candidate) => candidate.id === id)
      if (!task || isTaskDonePatchInFlight(id)) return

      const nextDone = !task.done
      if (nextDone) {
        const blocker = getTaskCompletionBlocker(task, allTasks)
        if (blocker) {
          showToast(blocker)
          return
        }
      }

      if (shared) {
        if (readiness === 'uncertain') {
          applyLocalDone(task, nextDone, latestPhases)
          return
        }
        const revision = taskStructure?.getLatestServerRevision() ?? updatedAt
        if (!revision) {
          showToast('Reload the server roadmap before updating tasks.')
          return
        }
        const nextPhases = buildTaskDonePhases(id, nextDone, latestPhases)
        await patchSyncedTaskDone({
          task,
          done: nextDone,
          nextPhases,
          revertPhases: buildTaskDonePhases,
          ...(taskStructure ? { lastUpdatedAt: revision } : {}),
        })
        return
      }

      applyLocalDone(task, nextDone, latestPhases)
    })()
  }

  const handleAddSubtask = (parentId: string, title: string) => {
    if (readOnly) return
    const sourcePhases = currentPhases()
    const allTasks = sourcePhases.flatMap((phase) => phase.tasks)
    const parent = allTasks.find((task) => task.id === parentId)
    if (!parent) return

    const newId = shared && taskStructure
      ? createInteractiveTaskId()
      : generateSubtaskId(parentId, allTasks)
    const newSubtask: Task = {
      id: newId,
      title,
      done: false,
      next: false,
      complexity: 'medium',
      tags: ['subtask'],
      deps: [],
      desc: '',
      parentId,
    }
    const phase = findPhaseForTask(sourcePhases, parentId)
    if (!phase) return
    const activity: ActivityChange = {
      action: 'task.created',
      entity_type: 'task',
      entity_id: newId,
      taskId: newId,
      taskTitle: title,
      phaseId: phase.id,
      phaseName: phase.name,
      parentId,
    }

    if (taskStructure?.createSyncedTask(phase.id, newSubtask, {
      onAggregateFallback: () => addActivity(activity),
    })) return

    setPhases(addTaskToPhase(sourcePhases, phase.id, newSubtask))
    addActivity(activity)
    setSaved(false)
  }

  const handleDeleteSubtask = (subtaskId: string) => {
    if (readOnly) return
    const sourcePhases = currentPhases()
    const allTasks = sourcePhases.flatMap((phase) => phase.tasks)
    const subtask = allTasks.find((task) => task.id === subtaskId)
    if (!subtask?.parentId) return
    const parent = allTasks.find((task) => task.id === subtask.parentId)
    const siblingCount = allTasks.filter((task) => task.parentId === subtask.parentId).length
    if (parent && getTaskComplexity(parent) === 'very_high' && siblingCount <= 2) {
      showToast('Very high complexity tasks require at least two direct subtasks. Lower complexity before removing this subtask.')
      return
    }

    if (taskStructure?.deleteSyncedTask(subtaskId, {
      onAggregateFallback: () => undefined,
    })) return

    setPhases(removeTaskSubtreeAndDependencies(sourcePhases, subtaskId))
    setSaved(false)
  }

  const handleAddTask = (phaseId: string, title?: string): string => {
    if (readOnly) return ''
    const sourcePhases = currentPhases()
    const allTasks = sourcePhases.flatMap((phase) => phase.tasks)
    const newId = shared && taskStructure
      ? createInteractiveTaskId()
      : generateTaskId(allTasks)
    const taskTitle = title?.trim() || 'New task'
    const newTask: Task = {
      id: newId,
      title: taskTitle,
      done: false,
      next: false,
      est: '',
      complexity: 'medium',
      tags: [],
      deps: [],
      desc: '',
    }
    const phase = sourcePhases.find((candidate) => candidate.id === phaseId)
    if (!phase) return ''
    const activity: ActivityChange = {
      action: 'task.created',
      entity_type: 'task',
      entity_id: newId,
      taskId: newId,
      taskTitle,
      phaseId: phase.id,
      phaseName: phase.name,
    }

    if (!taskStructure?.createSyncedTask(phaseId, newTask, {
      onAggregateFallback: () => addActivity(activity),
    })) {
      setPhases(addTaskToPhase(sourcePhases, phaseId, newTask))
      addActivity(activity)
      setSaved(false)
    }
    setExpandedTaskId(newId)
    return newId
  }

  const applyLocalTaskUpdate = (
    id: string,
    updates: Partial<Task>,
    sourcePhases: Phase[],
    changedFields: string[],
  ): boolean => {
    const task = sourcePhases.flatMap((phase) => phase.tasks).find((candidate) => candidate.id === id)
    if (!task) return false
    const phase = findPhaseForTask(sourcePhases, id)
    setPhases(sourcePhases.map((candidate) => ({
      ...candidate,
      tasks: candidate.tasks.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    })))
    addActivity(taskActivity(
      task,
      phase,
      changedFields,
      updates.title ?? task.title,
    ))
    setSaved(false)
    return true
  }

  const handleUpdateTask = async (
    id: string,
    updates: Partial<Task>,
  ): Promise<boolean> => {
    if (readOnly) return false

    let readiness: TaskServerReadiness = 'ready'
    if (shared && taskStructure) {
      readiness = await taskStructure.waitForTaskReady(id)
      if (readiness === 'absent') return false
    }

    const sourcePhases = currentPhases()
    const allTasks = sourcePhases.flatMap((phase) => phase.tasks)
    const task = allTasks.find((candidate) => candidate.id === id)
    if (!task) return false
    const complexityIssue = getTaskComplexityStructureIssue({ ...task, ...updates }, allTasks)
    if (complexityIssue) {
      showToast(complexityIssue)
      return false
    }
    const changedFields = getChangedTaskFields(task, updates)
    if (changedFields.length === 0) return true

    if (shared) {
      if (readiness === 'uncertain') {
        return applyLocalTaskUpdate(id, updates, sourcePhases, changedFields)
      }
      const revision = taskStructure?.getLatestServerRevision() ?? updatedAt
      if (!revision) {
        showToast('Reload the server roadmap before updating tasks.')
        return false
      }
      const patchUpdates = Object.fromEntries(
        changedFields.map((field) => [field, updates[field]]),
      ) as PatchTaskUpdates
      return patchSyncedTask({
        task,
        updates: patchUpdates,
        ...(taskStructure ? { lastUpdatedAt: revision } : {}),
      })
    }

    return applyLocalTaskUpdate(id, updates, sourcePhases, changedFields)
  }

  const handleLinkDependency = (taskId: string, depId: string) => {
    if (readOnly) return
    const sourcePhases = currentPhases()
    const allTasks = sourcePhases.flatMap((phase) => phase.tasks)
    if (hasCycleGraph(taskId, depId, allTasks)) {
      showToast('Circular dependency detected')
      return
    }
    const task = allTasks.find((candidate) => candidate.id === taskId)
    const depTask = allTasks.find((candidate) => candidate.id === depId)
    if (!task || !depTask) return
    const phase = findPhaseForTask(sourcePhases, taskId)
    const activity: ActivityChange = {
      action: 'task.dependency.linked',
      entity_type: 'task',
      entity_id: taskId,
      taskId,
      taskTitle: task.title,
      dependencyId: depId,
      dependencyTitle: depTask.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    }

    if (taskStructure?.setSyncedDependency(taskId, depId, true, {
      onAggregateFallback: () => addActivity(activity),
    })) return

    setPhases(setLocalTaskDependency(sourcePhases, taskId, depId, true))
    addActivity(activity)
    setSaved(false)
  }

  const handleUnlinkDependency = (taskId: string, depId: string) => {
    if (readOnly) return
    const sourcePhases = currentPhases()
    const allTasks = sourcePhases.flatMap((phase) => phase.tasks)
    const task = allTasks.find((candidate) => candidate.id === taskId)
    const depTask = allTasks.find((candidate) => candidate.id === depId)
    if (!task || !depTask) return
    const phase = findPhaseForTask(sourcePhases, taskId)
    const activity: ActivityChange = {
      action: 'task.dependency.unlinked',
      entity_type: 'task',
      entity_id: taskId,
      taskId,
      taskTitle: task.title,
      dependencyId: depId,
      dependencyTitle: depTask.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    }

    if (taskStructure?.setSyncedDependency(taskId, depId, false, {
      onAggregateFallback: () => addActivity(activity),
    })) return

    setPhases(setLocalTaskDependency(sourcePhases, taskId, depId, false))
    addActivity(activity)
    setSaved(false)
  }

  const handleReorderTasks = (phaseId: string, taskIds: string[]) => {
    if (readOnly) return
    const sourcePhases = currentPhases()
    const phase = sourcePhases.find((candidate) => candidate.id === phaseId)
    if (!phase) return
    const activity: ActivityChange = {
      action: 'task.reordered',
      entity_type: 'phase',
      entity_id: phaseId,
      phaseId,
      phaseName: phase.name,
    }

    if (taskStructure?.reorderSyncedTasks(phaseId, taskIds, {
      onAggregateFallback: () => addActivity(activity),
    })) return

    setPhases(orderTopLevelTasksByPreference(sourcePhases, phaseId, taskIds))
    addActivity(activity)
    setSaved(false)
  }

  const handleReorderSubtasks = (parentId: string, subtaskIds: string[]) => {
    if (readOnly) return
    const sourcePhases = currentPhases()
    const allTasks = sourcePhases.flatMap((phase) => phase.tasks)
    const parent = allTasks.find((task) => task.id === parentId)
    if (!parent) return
    const phase = findPhaseForTask(sourcePhases, parentId)
    const activity: ActivityChange = {
      action: 'task.reordered',
      entity_type: 'task',
      entity_id: parentId,
      taskId: parentId,
      taskTitle: parent.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    }

    if (taskStructure?.reorderSyncedSubtasks(parentId, subtaskIds, {
      onAggregateFallback: () => addActivity(activity),
    })) return

    setPhases(orderDirectSubtasksByPreference(sourcePhases, parentId, subtaskIds))
    addActivity(activity)
    setSaved(false)
  }

  return {
    hasCycle,
    onCheckTask,
    handleAddTask,
    handleAddSubtask,
    handleDeleteSubtask,
    handleUpdateTask,
    handleLinkDependency,
    handleUnlinkDependency,
    handleReorderTasks,
    handleReorderSubtasks,
  }
}
