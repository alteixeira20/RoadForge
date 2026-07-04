'use client'

import { useCallback, useRef, useState } from 'react'
import { getChangedTaskFields } from '@/lib/activity-changes'
import { patchTask, type PatchTaskUpdates } from '@/services/roadmap-crud.service'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
import {
  applyPartialWriteResult,
  mergeReturnedTaskFields,
} from './partialWriteHelpers'
import type {
  Phase,
  RoadmapConflictMetadata,
  TagDefinition,
  Task,
} from '@/types/roadmap'

interface UseTaskPatchParams {
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

interface PatchSyncedTaskParams {
  task: Task
  updates: PatchTaskUpdates
}

interface UseTaskPatchResult {
  taskPatchInFlight: boolean
  patchSyncedTask: (params: PatchSyncedTaskParams) => Promise<boolean>
}

export function useTaskPatch({
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
}: UseTaskPatchParams): UseTaskPatchResult {
  const [taskPatchInFlight, setTaskPatchInFlight] = useState(false)
  const pendingTaskIdsRef = useRef<Set<string>>(new Set())
  const phasesRef = useRef(phases)
  const savedRef = useRef(saved)

  phasesRef.current = phases
  savedRef.current = saved

  const patchSyncedTask = useCallback(async ({
    task,
    updates,
  }: PatchSyncedTaskParams): Promise<boolean> => {
    if (!serverRoadmapId || !sessionToken || !updatedAt) return false
    if (pendingTaskIdsRef.current.has(task.id)) return false

    const changedFields = getChangedTaskFields(task, updates)
    if (changedFields.length === 0) return true

    pendingTaskIdsRef.current.add(task.id)
    setTaskPatchInFlight(true)
    const wasSaved = savedRef.current

    try {
      const roadmap = await patchTask({
        roadmapId: serverRoadmapId,
        taskId: task.id,
        updates,
        sessionToken,
        lastUpdatedAt: updatedAt,
      })
      const appliedFullResponse = applyPartialWriteResult({
        roadmap,
        wasSaved,
        currentSaved: savedRef.current,
        setPhases,
        setTagRegistry,
        setUpdatedAt,
        setSaved,
      })
      if (!appliedFullResponse) {
        setPhases(mergeReturnedTaskFields(
          phasesRef.current,
          roadmap.phases,
          task.id,
          changedFields,
        ))
      }
      onSuccess()
      return true
    } catch (error) {
      handleTaskPatchError(error, {
        onConflict,
        onSessionExpired,
        showToast,
      })
      return false
    } finally {
      pendingTaskIdsRef.current.delete(task.id)
      setTaskPatchInFlight(pendingTaskIdsRef.current.size > 0)
    }
  }, [
    onConflict,
    onSessionExpired,
    onSuccess,
    serverRoadmapId,
    sessionToken,
    setPhases,
    setSaved,
    setTagRegistry,
    setUpdatedAt,
    showToast,
    updatedAt,
  ])

  return { taskPatchInFlight, patchSyncedTask }
}

interface TaskPatchErrorHandlers {
  onConflict: (metadata: RoadmapConflictMetadata | null) => void
  onSessionExpired: () => void
  showToast: (message: string) => void
}

function handleTaskPatchError(
  error: unknown,
  handlers: TaskPatchErrorHandlers,
) {
  const { kind, conflictMetadata } = classifyRoadmapSaveError(error)
  if (kind === 'conflict') {
    handlers.onConflict(conflictMetadata)
    handlers.showToast('This task changed on the server. Your draft is preserved for review.')
  } else if (
    kind === 'session-expired'
    || kind === 'unauthorized'
    || kind === 'forbidden'
  ) {
    handlers.onSessionExpired()
  } else if (kind === 'connection') {
    handlers.showToast('Could not reach the server. Your task draft is preserved.')
  } else {
    handlers.showToast('Task update failed. Your draft is preserved.')
  }
}
