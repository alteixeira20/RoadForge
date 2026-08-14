'use client'

import { useCallback } from 'react'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
import { isNewerServerRevision } from '@/lib/server-revision'
import {
  addTaskToPhase,
  mergeCreatedTaskAcknowledgement,
  removeTaskSubtreeAndDependencies,
  restoreDeletedTaskSubtree,
} from '@/lib/task-structure-merge'
import {
  createServerTask,
  deleteServerTask,
} from '@/services/roadmap-task-structure.service'
import type { Phase, Task } from '@/types/roadmap'
import { useTaskStructureOrderingSync } from './useTaskStructureOrderingSync'
import {
  useTaskStructureSyncState,
  type TaskServerReadiness,
} from './useTaskStructureSyncState'

export type { TaskServerReadiness } from './useTaskStructureSyncState'

interface UseTaskStructureSyncParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  serverRoadmapId: string | null
  sessionToken: string | null
  updatedAt: string | null
  setUpdatedAt: (updatedAt: string) => void
  showToast: (message: string) => void
  onSuccess: () => void
  onSessionExpired: () => void
  beginFocusedWrite: () => void
  endFocusedWrite: () => void
}

interface FocusedStructureOptions {
  onAggregateFallback: () => void
}

interface UseTaskStructureSyncResult {
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
}

function taskExists(phases: Phase[], taskId: string): boolean {
  return phases.some((phase) => phase.tasks.some((task) => task.id === taskId))
}

export function useTaskStructureSync({
  phases,
  setPhases,
  setSaved,
  serverRoadmapId,
  sessionToken,
  updatedAt,
  setUpdatedAt,
  showToast,
  onSuccess,
  onSessionExpired,
  beginFocusedWrite,
  endFocusedWrite,
}: UseTaskStructureSyncParams): UseTaskStructureSyncResult {
  const {
    phasesRef,
    setCurrentPhases,
    nextGeneration,
    ownsGeneration,
    responseIsStale,
    advanceUpdatedAt,
    waitForTaskReady,
    beginTaskCreation,
    finishTaskCreation,
    cachedRoadmap,
  } = useTaskStructureSyncState({
    phases,
    setPhases,
    updatedAt,
    setUpdatedAt,
  })

  const handleAmbiguousFailure = useCallback((
    message: string,
    onAggregateFallback: () => void,
  ) => {
    setSaved(false)
    onAggregateFallback()
    showToast(message)
  }, [setSaved, showToast])

  const createSyncedTask = useCallback((
    phaseId: string,
    task: Task,
    { onAggregateFallback }: FocusedStructureOptions,
  ): boolean => {
    if (!serverRoadmapId || !sessionToken) return false

    const { barrier, startedAtRevision } = beginTaskCreation(task.id)
    const scope = `task:${task.id}:existence`
    const generation = nextGeneration(scope)
    beginFocusedWrite()
    setCurrentPhases(addTaskToPhase(phasesRef.current, phaseId, task))

    void (async () => {
      let readiness: TaskServerReadiness = 'uncertain'
      try {
        const result = await createServerTask(serverRoadmapId, phaseId, task, sessionToken)
        readiness = 'ready'
        if (!responseIsStale(result.updatedAt)) {
          if (ownsGeneration(scope, generation)) {
            const reconciled = mergeCreatedTaskAcknowledgement(
              phasesRef.current,
              result.phases,
              task.id,
            )
            if (reconciled) setCurrentPhases(reconciled)
          }
          advanceUpdatedAt(result.updatedAt)
        }
        onSuccess()
      } catch (error) {
        const { kind } = classifyRoadmapSaveError(error)
        if (kind === 'conflict') {
          readiness = 'absent'
          const cached = cachedRoadmap()
          const remoteWinnerObserved = !!(
            cached
            && cached.updatedAt
            && isNewerServerRevision(cached.updatedAt, startedAtRevision)
            && taskExists(cached.phases, task.id)
          )
          if (!remoteWinnerObserved && ownsGeneration(scope, generation)) {
            setCurrentPhases(removeTaskSubtreeAndDependencies(phasesRef.current, task.id))
          }
          showToast('Another task already uses this ID. Your local create was cancelled.')
          return
        }

        const definitive = kind === 'validation'
          || kind === 'forbidden'
          || kind === 'unauthorized'
          || kind === 'session-expired'
        if (definitive) {
          readiness = 'absent'
          if (ownsGeneration(scope, generation)) {
            setCurrentPhases(removeTaskSubtreeAndDependencies(phasesRef.current, task.id))
          }
          if (kind === 'session-expired' || kind === 'unauthorized') {
            onSessionExpired()
          } else if (kind === 'forbidden') {
            showToast('You do not have permission to create tasks.')
          } else {
            showToast('The server rejected this task. The local task was removed.')
          }
          return
        }

        handleAmbiguousFailure(
          kind === 'connection'
            ? 'Could not confirm the new task with the server. It remains a local draft.'
            : 'Could not confirm the new task. It remains a local draft.',
          onAggregateFallback,
        )
      } finally {
        finishTaskCreation(task.id, barrier, readiness)
        endFocusedWrite()
      }
    })()

    return true
  }, [
    advanceUpdatedAt,
    beginFocusedWrite,
    beginTaskCreation,
    cachedRoadmap,
    endFocusedWrite,
    finishTaskCreation,
    handleAmbiguousFailure,
    nextGeneration,
    onSessionExpired,
    onSuccess,
    ownsGeneration,
    phasesRef,
    responseIsStale,
    serverRoadmapId,
    sessionToken,
    setCurrentPhases,
    showToast,
  ])

  const deleteSyncedTask = useCallback((
    taskId: string,
    { onAggregateFallback }: FocusedStructureOptions,
  ): boolean => {
    if (!serverRoadmapId || !sessionToken) return false

    const beforePhases = phasesRef.current
    const readinessPromise = waitForTaskReady(taskId)
    const scope = `task:${taskId}:existence`
    const generation = nextGeneration(scope)
    beginFocusedWrite()
    setCurrentPhases(removeTaskSubtreeAndDependencies(beforePhases, taskId))

    void (async () => {
      try {
        const readiness = await readinessPromise
        if (readiness === 'absent') {
          onSuccess()
          return
        }
        if (readiness === 'uncertain') {
          handleAmbiguousFailure(
            'Could not confirm the task deletion with the server. The deletion remains a local draft.',
            onAggregateFallback,
          )
          return
        }

        const result = await deleteServerTask(serverRoadmapId, taskId, sessionToken)
        if (!responseIsStale(result.updatedAt)) {
          if (ownsGeneration(scope, generation)) {
            setCurrentPhases(removeTaskSubtreeAndDependencies(phasesRef.current, taskId))
          }
          advanceUpdatedAt(result.updatedAt)
        }
        onSuccess()
      } catch (error) {
        const { kind, status } = classifyRoadmapSaveError(error)
        if (status === 404) {
          onSuccess()
          return
        }
        const definitive = kind === 'validation'
          || kind === 'forbidden'
          || kind === 'unauthorized'
          || kind === 'session-expired'
        if (definitive) {
          if (ownsGeneration(scope, generation)) {
            setCurrentPhases(restoreDeletedTaskSubtree(phasesRef.current, beforePhases, taskId))
          }
          if (kind === 'session-expired' || kind === 'unauthorized') {
            onSessionExpired()
          } else if (kind === 'forbidden') {
            showToast('You do not have permission to delete tasks.')
          } else {
            showToast('The server rejected this task deletion.')
          }
          return
        }
        handleAmbiguousFailure(
          kind === 'connection'
            ? 'Could not confirm the task deletion with the server. It remains a local draft.'
            : 'Could not confirm the task deletion. It remains a local draft.',
          onAggregateFallback,
        )
      } finally {
        endFocusedWrite()
      }
    })()
    return true
  }, [
    advanceUpdatedAt,
    beginFocusedWrite,
    endFocusedWrite,
    handleAmbiguousFailure,
    nextGeneration,
    onSessionExpired,
    onSuccess,
    ownsGeneration,
    phasesRef,
    responseIsStale,
    serverRoadmapId,
    sessionToken,
    setCurrentPhases,
    showToast,
    waitForTaskReady,
  ])

  const ordering = useTaskStructureOrderingSync({
    phasesRef,
    setCurrentPhases,
    serverRoadmapId,
    sessionToken,
    beginFocusedWrite,
    endFocusedWrite,
    nextGeneration,
    ownsGeneration,
    responseIsStale,
    advanceUpdatedAt,
    waitForTaskReady,
    handleAmbiguousFailure,
    onSuccess,
    onSessionExpired,
    showToast,
  })

  return {
    createSyncedTask,
    deleteSyncedTask,
    ...ordering,
    waitForTaskReady,
  }
}
