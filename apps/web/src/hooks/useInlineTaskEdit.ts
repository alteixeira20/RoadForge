'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  commitTaskField,
  type CommitTaskFieldResult,
  type InlineTaskField,
} from '@/hooks/taskMutationHelpers'
import { useEditLock } from '@/hooks/useEditLock'
import { useIdleEditPause } from '@/hooks/useIdleEditPause'
import type { Task } from '@/types/roadmap'

export interface UseInlineTaskEditParams {
  task: Task
  readOnly: boolean
  lockedByOther?: boolean
  serverRoadmapId: string | null
  sessionToken: string | null
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onAcquireError?: (isConflict: boolean) => void
}

export interface UseInlineTaskEditResult {
  activeField: InlineTaskField | null
  isEditing: boolean
  isBlocked: boolean
  ownsLock: boolean
  isAcquiring: boolean
  isReleasing: boolean
  isIdlePaused: boolean
  lastInteractionAt: number | null
  canCommit: boolean
  beginEdit: (field: InlineTaskField) => Promise<boolean>
  cancelEdit: () => Promise<void>
  commitEdit: (value: string) => Promise<CommitTaskFieldResult | null>
  recordInteraction: () => void
  resumeEditing: () => Promise<boolean>
}

export function useInlineTaskEdit({
  task,
  readOnly,
  lockedByOther = false,
  serverRoadmapId,
  sessionToken,
  onUpdateTask,
  onAcquireError,
}: UseInlineTaskEditParams): UseInlineTaskEditResult {
  const [activeField, setActiveField] = useState<InlineTaskField | null>(null)
  const isBlocked = readOnly || lockedByOther
  const {
    isIdlePaused,
    lastInteractionAt,
    recordInteraction,
    resumeEditing: markEditingResumed,
  } = useIdleEditPause({
    active: activeField !== null && !readOnly,
  })
  const {
    ownsLock,
    isAcquiring,
    isReleasing,
    tryAcquire,
    release,
  } = useEditLock({
    target: `task:${task.id}`,
    active: activeField !== null && !isBlocked && !isIdlePaused,
    serverRoadmapId,
    sessionToken,
    onAcquireError,
  })
  const canCommit = activeField !== null && ownsLock && !isBlocked && !isIdlePaused

  const beginEdit = useCallback(async (field: InlineTaskField): Promise<boolean> => {
    if (isBlocked || isAcquiring || isReleasing) return false
    if (activeField !== null && ownsLock) {
      setActiveField(field)
      return true
    }

    const acquired = await tryAcquire()
    if (acquired) setActiveField(field)
    return acquired
  }, [activeField, isAcquiring, isBlocked, isReleasing, ownsLock, tryAcquire])

  const resumeEditing = useCallback(async (): Promise<boolean> => {
    if (readOnly || lockedByOther) return false
    await release()
    const acquired = await tryAcquire()
    if (acquired) markEditingResumed()
    return acquired
  }, [lockedByOther, markEditingResumed, readOnly, release, tryAcquire])

  const cancelEdit = useCallback(async (): Promise<void> => {
    setActiveField(null)
    await release()
  }, [release])

  const commitEdit = useCallback(async (
    value: string,
  ): Promise<CommitTaskFieldResult | null> => {
    if (!canCommit || activeField === null) return null

    const result = commitTaskField(task, activeField, value)
    if (!result.ok) return result

    if (result.changed) onUpdateTask(task.id, result.updates)
    setActiveField(null)
    await release()
    return result
  }, [activeField, canCommit, onUpdateTask, release, task])

  useEffect(() => {
    if (!readOnly || activeField === null) return
    void release()
  }, [activeField, readOnly, release])

  return {
    activeField,
    isEditing: activeField !== null,
    isBlocked,
    ownsLock,
    isAcquiring,
    isReleasing,
    isIdlePaused,
    lastInteractionAt,
    canCommit,
    beginEdit,
    cancelEdit,
    commitEdit,
    recordInteraction,
    resumeEditing,
  }
}
