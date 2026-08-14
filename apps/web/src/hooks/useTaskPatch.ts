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
  lastUpdatedAt?: string
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
    lastUpdatedAt,
  }: PatchSyncedTaskParams): Promise<boolean> => {
    const revision = lastUpdatedAt ?? updatedAt
    if (!serverRoadmapId || !sessionToken || !revision) return false
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
        lastUpdatedAt: revision,
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

export function handleTaskPatchError(
  error: unknown,
  handlers: TaskPatchErrorHandlers,
) {
  const { kind, conflictMetadata, validationMessage } = classifyRoadmapSaveError(error)
  if (kind === 'conflict') {
    handlers.onConflict(conflictMetadata)
    handlers.showToast('This task changed on the server. Your draft is preserved for review.')
  } else if (
    kind === 'session-expired'
    || kind === 'unauthorized'
  ) {
    handlers.onSessionExpired()
  } else if (kind === 'forbidden') {
    handlers.showToast('You do not have permission to update this task. Your draft is preserved.')
  } else if (kind === 'validation') {
    handlers.showToast(
      validationMessage ?? 'The server rejected this task update. Your draft is preserved.',
    )
  } else if (kind === 'connection') {
    handlers.showToast('Could not reach the server. Your task draft is preserved.')
  } else {
    handlers.showToast('Task update failed. Your draft is preserved.')
  }
}
