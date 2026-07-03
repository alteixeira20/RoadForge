'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  commitTaskField,
  type CommitTaskFieldResult,
  type InlineTaskField,
} from '@/hooks/taskMutationHelpers'
import { useEditLock } from '@/hooks/useEditLock'
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
  beginEdit: (field: InlineTaskField) => Promise<boolean>
  cancelEdit: () => Promise<void>
  commitEdit: (value: string) => Promise<CommitTaskFieldResult | null>
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
    ownsLock,
    isAcquiring,
    isReleasing,
    tryAcquire,
    release,
  } = useEditLock({
    target: `task:${task.id}`,
    active: activeField !== null && !isBlocked,
    serverRoadmapId,
    sessionToken,
    onAcquireError,
  })

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

  const cancelEdit = useCallback(async (): Promise<void> => {
    setActiveField(null)
    await release()
  }, [release])

  const commitEdit = useCallback(async (
    value: string,
  ): Promise<CommitTaskFieldResult | null> => {
    if (activeField === null) return null

    const result = commitTaskField(task, activeField, value)
    if (!result.ok) return result

    if (result.changed) onUpdateTask(task.id, result.updates)
    setActiveField(null)
    await release()
    return result
  }, [activeField, onUpdateTask, release, task])

  useEffect(() => {
    if (!isBlocked || activeField === null) return
    setActiveField(null)
    void release()
  }, [activeField, isBlocked, release])

  return {
    activeField,
    isEditing: activeField !== null,
    isBlocked,
    ownsLock,
    isAcquiring,
    isReleasing,
    beginEdit,
    cancelEdit,
    commitEdit,
  }
}
