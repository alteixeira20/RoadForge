'use client'

import { useCallback, useRef, useState } from 'react'
import { patchTaskDone } from '@/services/roadmap-crud.service'
import {
  getConflictMetadata,
  isApiConnectionError,
  isAuthError,
  isConflictError,
  isSessionExpiredError,
} from '@/services/roadmap-http'
import { applyPartialWriteResult } from './partialWriteHelpers'
import type { Phase, RoadmapConflictMetadata, TagDefinition, Task } from '@/types/roadmap'

interface UseTaskDonePatchParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setTagRegistry: (registry: TagDefinition[]) => void
  saved: boolean
  setSaved: (saved: boolean) => void
  serverRoadmapId: string | null
  sessionToken: string | null
  updatedAt: string | null
  setUpdatedAt: (updatedAt: string) => void
  showToast: (message: string) => void
  onSuccess: () => void
  onConflict: (metadata: RoadmapConflictMetadata | null) => void
  onSessionExpired: () => void
}

interface PatchSyncedTaskDoneParams {
  task: Task
  done: boolean
  nextPhases: Phase[]
  revertPhases: (taskId: string, done: boolean, phases: Phase[]) => Phase[]
}

interface UseTaskDonePatchResult {
  pendingTaskDoneIds: ReadonlySet<string>
  partialWriteInFlight: boolean
  isTaskDonePatchInFlight: (taskId: string) => boolean
  patchSyncedTaskDone: (params: PatchSyncedTaskDoneParams) => Promise<boolean>
}

export function useTaskDonePatch({
  phases,
  setPhases,
  setTagRegistry,
  saved,
  setSaved,
  serverRoadmapId,
  sessionToken,
  updatedAt,
  setUpdatedAt,
  showToast,
  onSuccess,
  onConflict,
  onSessionExpired,
}: UseTaskDonePatchParams): UseTaskDonePatchResult {
  const [pendingTaskDoneIds, setPendingTaskDoneIds] = useState<ReadonlySet<string>>(() => new Set())
  const pendingTaskDoneIdsRef = useRef<Set<string>>(new Set())
  const phasesRef = useRef(phases)
  const savedRef = useRef(saved)

  phasesRef.current = phases
  savedRef.current = saved

  const beginTaskDonePatch = useCallback((taskId: string): boolean => {
    if (pendingTaskDoneIdsRef.current.has(taskId)) return false
    const next = new Set(pendingTaskDoneIdsRef.current)
    next.add(taskId)
    pendingTaskDoneIdsRef.current = next
    setPendingTaskDoneIds(next)
    return true
  }, [])

  const endTaskDonePatch = useCallback((taskId: string) => {
    const next = new Set(pendingTaskDoneIdsRef.current)
    next.delete(taskId)
    pendingTaskDoneIdsRef.current = next
    setPendingTaskDoneIds(next)
  }, [])

  const isTaskDonePatchInFlight = useCallback(
    (taskId: string): boolean => pendingTaskDoneIdsRef.current.has(taskId),
    [],
  )

  const handleTaskDonePatchError = useCallback((err: unknown) => {
    const nextConflict = getConflictMetadata(err)
    if (nextConflict || isConflictError(err)) {
      onConflict(nextConflict)
      showToast('This task changed on the server. Reload or review the conflict before trying again.')
    } else if (isSessionExpiredError(err)) {
      onSessionExpired()
    } else if (isAuthError(err)) {
      showToast('You do not have permission to update this task.')
    } else if (isApiConnectionError(err)) {
      showToast('Could not reach the server. Task update was reverted.')
    } else {
      showToast('Task update failed. Your change was reverted.')
    }
  }, [onConflict, onSessionExpired, showToast])

  const patchSyncedTaskDone = useCallback(async ({
    task,
    done,
    nextPhases,
    revertPhases,
  }: PatchSyncedTaskDoneParams): Promise<boolean> => {
    if (!serverRoadmapId || !sessionToken || !updatedAt) return false
    if (!beginTaskDonePatch(task.id)) return true

    const wasSaved = saved
    setPhases(nextPhases)

    try {
      const roadmap = await patchTaskDone({
        roadmapId: serverRoadmapId,
        taskId: task.id,
        done,
        sessionToken,
        lastUpdatedAt: updatedAt,
      })
      applyPartialWriteResult({
        roadmap,
        wasSaved,
        currentSaved: savedRef.current,
        setPhases,
        setTagRegistry,
        setUpdatedAt,
        setSaved,
      })
      onSuccess()
    } catch (err) {
      const currentSaved = savedRef.current
      setPhases(revertPhases(task.id, task.done, phasesRef.current))
      setSaved(wasSaved && currentSaved)
      handleTaskDonePatchError(err)
    } finally {
      endTaskDonePatch(task.id)
    }
    return true
  }, [
    beginTaskDonePatch,
    endTaskDonePatch,
    handleTaskDonePatchError,
    onSuccess,
    saved,
    serverRoadmapId,
    sessionToken,
    setPhases,
    setSaved,
    setTagRegistry,
    setUpdatedAt,
    updatedAt,
  ])

  return {
    pendingTaskDoneIds,
    partialWriteInFlight: pendingTaskDoneIds.size > 0,
    isTaskDonePatchInFlight,
    patchSyncedTaskDone,
  }
}
