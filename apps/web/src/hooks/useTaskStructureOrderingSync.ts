'use client'

import { useCallback, type RefObject } from 'react'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
import {
  mergeTaskDependencyAcknowledgement,
  orderDirectSubtasksByPreference,
  orderTopLevelTasksByPreference,
  setLocalTaskDependency,
} from '@/lib/task-structure-merge'
import {
  reorderServerSubtasks,
  reorderServerTasks,
  setServerTaskDependency,
} from '@/services/roadmap-task-structure.service'
import type { Phase } from '@/types/roadmap'
import type { TaskServerReadiness } from './useTaskStructureSyncState'

interface FocusedStructureOptions {
  onAggregateFallback: () => void
}

interface UseTaskStructureOrderingSyncParams {
  phasesRef: RefObject<Phase[]>
  setCurrentPhases: (phases: Phase[]) => void
  serverRoadmapId: string | null
  sessionToken: string | null
  beginFocusedWrite: () => void
  endFocusedWrite: () => void
  nextGeneration: (scope: string) => number
  ownsGeneration: (scope: string, generation: number) => boolean
  responseIsStale: (candidate: string) => boolean
  advanceUpdatedAt: (candidate: string) => void
  waitForTaskReady: (taskId: string) => Promise<TaskServerReadiness>
  handleAmbiguousFailure: (message: string, onAggregateFallback: () => void) => void
  onSuccess: () => void
  onSessionExpired: () => void
  showToast: (message: string) => void
}

export function useTaskStructureOrderingSync({
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
}: UseTaskStructureOrderingSyncParams) {
  const reorderSyncedTasks = useCallback((
    phaseId: string,
    taskIds: string[],
    { onAggregateFallback }: FocusedStructureOptions,
  ): boolean => {
    if (!serverRoadmapId || !sessionToken) return false
    const beforePhases = phasesRef.current
    const readinessPromises = taskIds.map((taskId) => waitForTaskReady(taskId))
    const scope = `phase:${phaseId}:task-order`
    const generation = nextGeneration(scope)
    beginFocusedWrite()
    setCurrentPhases(orderTopLevelTasksByPreference(beforePhases, phaseId, taskIds))

    void (async () => {
      try {
        const readiness = await Promise.all(readinessPromises)
        if (readiness.includes('uncertain')) {
          handleAmbiguousFailure(
            'Could not confirm the task order with the server. The order remains a local draft.',
            onAggregateFallback,
          )
          return
        }
        const readyIds = taskIds.filter((_, index) => readiness[index] !== 'absent')
        if (readyIds.length === 0) {
          onSuccess()
          return
        }
        const result = await reorderServerTasks(
          serverRoadmapId,
          phaseId,
          readyIds,
          sessionToken,
        )
        if (!responseIsStale(result.updatedAt)) {
          if (ownsGeneration(scope, generation)) {
            const serverPhase = result.phases.find((phase) => phase.id === phaseId)
            if (serverPhase) {
              const authoritativeOrder = serverPhase.tasks
                .filter((task) => !task.parentId)
                .map((task) => task.id)
              setCurrentPhases(orderTopLevelTasksByPreference(
                phasesRef.current,
                phaseId,
                authoritativeOrder,
              ))
            }
          }
          advanceUpdatedAt(result.updatedAt)
        }
        onSuccess()
      } catch (error) {
        const { kind } = classifyRoadmapSaveError(error)
        const definitive = kind === 'validation'
          || kind === 'forbidden'
          || kind === 'unauthorized'
          || kind === 'session-expired'
        if (definitive) {
          if (ownsGeneration(scope, generation)) {
            const beforePhase = beforePhases.find((phase) => phase.id === phaseId)
            if (beforePhase) {
              setCurrentPhases(orderTopLevelTasksByPreference(
                phasesRef.current,
                phaseId,
                beforePhase.tasks.filter((task) => !task.parentId).map((task) => task.id),
              ))
            }
          }
          if (kind === 'session-expired' || kind === 'unauthorized') onSessionExpired()
          else if (kind === 'forbidden') showToast('You do not have permission to reorder tasks.')
          else showToast('The server rejected this task order.')
          return
        }
        handleAmbiguousFailure(
          'Could not confirm the task order with the server. It remains a local draft.',
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

  const reorderSyncedSubtasks = useCallback((
    parentId: string,
    taskIds: string[],
    { onAggregateFallback }: FocusedStructureOptions,
  ): boolean => {
    if (!serverRoadmapId || !sessionToken) return false
    const beforePhases = phasesRef.current
    const readinessPromises = [
      waitForTaskReady(parentId),
      ...taskIds.map((taskId) => waitForTaskReady(taskId)),
    ]
    const scope = `task:${parentId}:child-order`
    const generation = nextGeneration(scope)
    beginFocusedWrite()
    setCurrentPhases(orderDirectSubtasksByPreference(beforePhases, parentId, taskIds))

    void (async () => {
      try {
        const readiness = await Promise.all(readinessPromises)
        const parentReadiness = readiness[0]
        if (readiness.includes('uncertain')) {
          handleAmbiguousFailure(
            'Could not confirm the subtask order with the server. The order remains a local draft.',
            onAggregateFallback,
          )
          return
        }
        if (parentReadiness === 'absent') {
          onSuccess()
          return
        }
        const readyIds = taskIds.filter((_, index) => readiness[index + 1] !== 'absent')
        if (readyIds.length === 0) {
          onSuccess()
          return
        }
        const result = await reorderServerSubtasks(
          serverRoadmapId,
          parentId,
          readyIds,
          sessionToken,
        )
        if (!responseIsStale(result.updatedAt)) {
          if (ownsGeneration(scope, generation)) {
            const serverPhase = result.phases.find((phase) => (
              phase.tasks.some((task) => task.id === parentId)
            ))
            if (serverPhase) {
              const authoritativeOrder = serverPhase.tasks
                .filter((task) => task.parentId === parentId)
                .map((task) => task.id)
              setCurrentPhases(orderDirectSubtasksByPreference(
                phasesRef.current,
                parentId,
                authoritativeOrder,
              ))
            }
          }
          advanceUpdatedAt(result.updatedAt)
        }
        onSuccess()
      } catch (error) {
        const { kind } = classifyRoadmapSaveError(error)
        const definitive = kind === 'validation'
          || kind === 'forbidden'
          || kind === 'unauthorized'
          || kind === 'session-expired'
        if (definitive) {
          if (ownsGeneration(scope, generation)) {
            const beforeParentPhase = beforePhases.find((phase) => (
              phase.tasks.some((task) => task.id === parentId)
            ))
            if (beforeParentPhase) {
              setCurrentPhases(orderDirectSubtasksByPreference(
                phasesRef.current,
                parentId,
                beforeParentPhase.tasks
                  .filter((task) => task.parentId === parentId)
                  .map((task) => task.id),
              ))
            }
          }
          if (kind === 'session-expired' || kind === 'unauthorized') onSessionExpired()
          else if (kind === 'forbidden') showToast('You do not have permission to reorder subtasks.')
          else showToast('The server rejected this subtask order.')
          return
        }
        handleAmbiguousFailure(
          'Could not confirm the subtask order with the server. It remains a local draft.',
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

  const setSyncedDependency = useCallback((
    taskId: string,
    dependencyId: string,
    linked: boolean,
    { onAggregateFallback }: FocusedStructureOptions,
  ): boolean => {
    if (!serverRoadmapId || !sessionToken) return false
    const task = phasesRef.current.flatMap((phase) => phase.tasks).find((candidate) => candidate.id === taskId)
    if (!task) return true
    const previousLinked = (task.deps ?? []).includes(dependencyId)
    if (previousLinked === linked) return true

    const readinessPromises = [waitForTaskReady(taskId), waitForTaskReady(dependencyId)]
    const scope = `dependency:${taskId}:${dependencyId}`
    const generation = nextGeneration(scope)
    beginFocusedWrite()
    setCurrentPhases(setLocalTaskDependency(
      phasesRef.current,
      taskId,
      dependencyId,
      linked,
    ))

    void (async () => {
      try {
        const readiness = await Promise.all(readinessPromises)
        if (readiness.includes('uncertain')) {
          handleAmbiguousFailure(
            'Could not confirm the dependency change with the server. It remains a local draft.',
            onAggregateFallback,
          )
          return
        }
        if (readiness.includes('absent')) {
          if (ownsGeneration(scope, generation)) {
            setCurrentPhases(setLocalTaskDependency(
              phasesRef.current,
              taskId,
              dependencyId,
              previousLinked,
            ))
          }
          onSuccess()
          return
        }

        const result = await setServerTaskDependency(
          serverRoadmapId,
          taskId,
          dependencyId,
          linked,
          sessionToken,
        )
        if (!responseIsStale(result.updatedAt)) {
          if (ownsGeneration(scope, generation)) {
            const reconciled = mergeTaskDependencyAcknowledgement(
              phasesRef.current,
              result.phases,
              taskId,
            )
            if (reconciled) setCurrentPhases(reconciled)
          }
          advanceUpdatedAt(result.updatedAt)
        }
        onSuccess()
      } catch (error) {
        const { kind, status } = classifyRoadmapSaveError(error)
        if (status === 404) {
          if (linked && ownsGeneration(scope, generation)) {
            setCurrentPhases(setLocalTaskDependency(
              phasesRef.current,
              taskId,
              dependencyId,
              false,
            ))
          }
          onSuccess()
          return
        }
        const definitive = kind === 'validation'
          || kind === 'forbidden'
          || kind === 'unauthorized'
          || kind === 'session-expired'
        if (definitive) {
          if (ownsGeneration(scope, generation)) {
            setCurrentPhases(setLocalTaskDependency(
              phasesRef.current,
              taskId,
              dependencyId,
              previousLinked,
            ))
          }
          if (kind === 'session-expired' || kind === 'unauthorized') onSessionExpired()
          else if (kind === 'forbidden') showToast('You do not have permission to change dependencies.')
          else showToast('The server rejected this dependency change.')
          return
        }
        handleAmbiguousFailure(
          'Could not confirm the dependency change with the server. It remains a local draft.',
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

  return {
    reorderSyncedTasks,
    reorderSyncedSubtasks,
    setSyncedDependency,
  }
}
