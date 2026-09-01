'use client'

import { useCallback, useState } from 'react'
import { TEAM_FEATURES_ENABLED } from '@/config/capabilities'
import { useRoadmapData, useRoadmapSession } from '@/context/RoadmapContext'
import { addTaskAssignee } from '@/lib/task-assignment'
import { waitForPendingTaskCreation } from '@/lib/task-creation-readiness'
import { patchTaskClaim, deleteTaskClaim } from '@/services/roadmap-crud.service'
import { isAuthError, isApiConnectionError, isConflictError } from '@/services/roadmap-http'
import type { Task } from '@/types/roadmap'

interface UseTaskClaimParams {
  task: Task
  showToast: (msg: string) => void
}

export interface UseTaskClaimResult {
  isClaiming: boolean
  isClaimedByMe: boolean
  canOverrideClaim: boolean
  claimer: string | null
  handleClaim: (override?: boolean) => Promise<void>
  handleUnclaim: (override?: boolean) => Promise<void>
}

export function useTaskClaim({ task, showToast }: UseTaskClaimParams): UseTaskClaimResult {
  const {
    displayName,
    phases,
    setPhases,
    setSaved,
    setUpdatedAt,
  } = useRoadmapData()
  const {
    participantId,
    role,
    serverRoadmapId,
    sessionToken,
  } = useRoadmapSession()

  const [isClaiming, setIsClaiming] = useState(false)

  const claimer = TEAM_FEATURES_ENABLED ? task.claimedBy ?? null : null
  const isClaimedByMe = TEAM_FEATURES_ENABLED && Boolean(
    claimer && (
      (participantId && task.claimedById === participantId) ||
      (!participantId && claimer === displayName)
    ),
  )
  const canOverrideClaim = TEAM_FEATURES_ENABLED && Boolean(
    claimer && !isClaimedByMe && (role === 'owner' || !serverRoadmapId),
  )

  const applyLocalClaim = useCallback((claimedBy: string | null) => {
    setPhases(
      phases.map((phase) => ({
        ...phase,
        tasks: phase.tasks.map((t) => {
          if (t.id !== task.id) return t
          if (claimedBy === null) {
            const next = { ...t }
            delete next.claimedBy
            delete next.claimedById
            delete next.claimedAt
            return next
          }
          const assignedTask = addTaskAssignee(t, claimedBy)
          return {
            ...assignedTask,
            claimedBy,
            claimedById: participantId ?? undefined,
            claimedAt: new Date().toISOString(),
          }
        }),
      })),
    )
    setSaved(false)
  }, [phases, setPhases, setSaved, task.id, participantId])

  const waitForServerTask = useCallback(async (): Promise<boolean> => {
    const readiness = await waitForPendingTaskCreation(task.id)
    if (readiness === 'ready') return true
    if (readiness === 'uncertain') {
      showToast('This task has not been confirmed on the server yet. Reconnect or save it before changing its claim.')
    }
    return false
  }, [showToast, task.id])

  const handleClaim = useCallback(async (override = false) => {
    if (!TEAM_FEATURES_ENABLED || isClaiming || task.done || role === 'viewer') return

    if (serverRoadmapId && sessionToken) {
      setIsClaiming(true)
      try {
        if (!await waitForServerTask()) return
        const roadmap = await patchTaskClaim({
          roadmapId: serverRoadmapId,
          taskId: task.id,
          sessionToken,
          override,
        })
        setPhases(roadmap.phases)
        setUpdatedAt(roadmap.updatedAt)
      } catch (err) {
        if (isConflictError(err)) {
          showToast(`${task.claimedBy ?? 'Another participant'} is already working on this task.`)
        } else if (isAuthError(err)) {
          showToast('You do not have permission to claim this task.')
        } else if (isApiConnectionError(err)) {
          showToast('Could not reach the server.')
        } else {
          showToast('Failed to claim task.')
        }
      } finally {
        setIsClaiming(false)
      }
    } else {
      applyLocalClaim(displayName)
    }
  }, [isClaiming, task.done, task.id, task.claimedBy, role, serverRoadmapId, sessionToken, applyLocalClaim, displayName, setPhases, setUpdatedAt, showToast, waitForServerTask])

  const handleUnclaim = useCallback(async (override = false) => {
    if (!TEAM_FEATURES_ENABLED || isClaiming || role === 'viewer') return

    if (serverRoadmapId && sessionToken) {
      setIsClaiming(true)
      try {
        if (!await waitForServerTask()) return
        const roadmap = await deleteTaskClaim({
          roadmapId: serverRoadmapId,
          taskId: task.id,
          sessionToken,
          override,
        })
        setPhases(roadmap.phases)
        setUpdatedAt(roadmap.updatedAt)
      } catch (err) {
        if (isConflictError(err)) {
          showToast(`${task.claimedBy ?? 'Another participant'} still owns this claim.`)
        } else if (isAuthError(err)) {
          showToast('You do not have permission to unclaim this task.')
        } else if (isApiConnectionError(err)) {
          showToast('Could not reach the server.')
        } else {
          showToast('Failed to unclaim task.')
        }
      } finally {
        setIsClaiming(false)
      }
    } else {
      applyLocalClaim(null)
    }
  }, [isClaiming, task.id, task.claimedBy, role, serverRoadmapId, sessionToken, applyLocalClaim, setPhases, setUpdatedAt, showToast, waitForServerTask])

  return {
    isClaiming,
    isClaimedByMe,
    canOverrideClaim,
    claimer,
    handleClaim,
    handleUnclaim,
  }
}
