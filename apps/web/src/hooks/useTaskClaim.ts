'use client'

import { useCallback, useState } from 'react'
import { useRoadmap } from '@/context/RoadmapContext'
import { patchTaskClaim, deleteTaskClaim } from '@/services/roadmap-crud.service'
import { isAuthError, isApiConnectionError } from '@/services/roadmap-http'
import type { Task } from '@/types/roadmap'

interface UseTaskClaimParams {
  task: Task
  showToast: (msg: string) => void
}

export interface UseTaskClaimResult {
  isClaiming: boolean
  isClaimedByMe: boolean
  claimer: string | null
  handleClaim: () => Promise<void>
  handleUnclaim: () => Promise<void>
}

export function useTaskClaim({ task, showToast }: UseTaskClaimParams): UseTaskClaimResult {
  const {
    displayName,
    participantId,
    serverRoadmapId,
    sessionToken,
    phases,
    setPhases,
    setSaved,
    setUpdatedAt,
  } = useRoadmap()

  const [isClaiming, setIsClaiming] = useState(false)

  const claimer = task.claimedBy ?? null
  const isClaimedByMe = Boolean(
    claimer && (
      (participantId && task.claimedById === participantId) ||
      (!participantId && claimer === displayName)
    ),
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
          return {
            ...t,
            claimedBy,
            claimedById: participantId ?? undefined,
            claimedAt: new Date().toISOString(),
          }
        }),
      })),
    )
    setSaved(false)
  }, [phases, setPhases, setSaved, task.id, participantId])

  const handleClaim = useCallback(async () => {
    if (isClaiming || task.done) return

    if (serverRoadmapId && sessionToken) {
      setIsClaiming(true)
      try {
        const roadmap = await patchTaskClaim({ roadmapId: serverRoadmapId, taskId: task.id, sessionToken })
        setPhases(roadmap.phases)
        setUpdatedAt(roadmap.updatedAt)
      } catch (err) {
        if (isAuthError(err)) {
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
  }, [isClaiming, task.done, task.id, serverRoadmapId, sessionToken, applyLocalClaim, displayName, setPhases, setUpdatedAt, showToast])

  const handleUnclaim = useCallback(async () => {
    if (isClaiming) return

    if (serverRoadmapId && sessionToken) {
      setIsClaiming(true)
      try {
        const roadmap = await deleteTaskClaim({ roadmapId: serverRoadmapId, taskId: task.id, sessionToken })
        setPhases(roadmap.phases)
        setUpdatedAt(roadmap.updatedAt)
      } catch (err) {
        if (isAuthError(err)) {
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
  }, [isClaiming, task.id, serverRoadmapId, sessionToken, applyLocalClaim, setPhases, setUpdatedAt, showToast])

  return {
    isClaiming,
    isClaimedByMe,
    claimer,
    handleClaim,
    handleUnclaim,
  }
}
