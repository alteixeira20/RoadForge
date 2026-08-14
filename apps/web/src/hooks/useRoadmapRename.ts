'use client'

import { useCallback, useRef } from 'react'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
import { isNewerServerRevision } from '@/lib/server-revision'
import { patchRoadmapName } from '@/services/roadmap-structure.service'

const ROADMAP_NAME_MAX = 120

interface UseRoadmapRenameParams {
  roadmapName: string
  setRoadmapName: (name: string) => void
  setSaved: (saved: boolean) => void
  canRename: boolean
  serverRoadmapId: string | null
  sessionToken: string | null
  updatedAt: string | null
  setUpdatedAt: (updatedAt: string) => void
  onLocalRename?: (name: string) => boolean
  showMessage: (message: string | null) => void
  onSessionExpired: () => void
}

interface UseRoadmapRenameResult {
  handleRenameRoadmap: (name: string) => boolean
}

export function useRoadmapRename({
  roadmapName,
  setRoadmapName,
  setSaved,
  canRename,
  serverRoadmapId,
  sessionToken,
  updatedAt,
  setUpdatedAt,
  onLocalRename,
  showMessage,
  onSessionExpired,
}: UseRoadmapRenameParams): UseRoadmapRenameResult {
  const roadmapNameRef = useRef(roadmapName)
  const latestRevisionRef = useRef<string | null>(updatedAt)
  const queueRef = useRef<Promise<void>>(Promise.resolve())

  roadmapNameRef.current = roadmapName
  if (updatedAt && isNewerServerRevision(updatedAt, latestRevisionRef.current)) {
    latestRevisionRef.current = updatedAt
  }

  const advanceUpdatedAt = useCallback((candidate: string) => {
    if (!isNewerServerRevision(candidate, latestRevisionRef.current)) return
    latestRevisionRef.current = candidate
    setUpdatedAt(candidate)
  }, [setUpdatedAt])

  const handleRenameRoadmap = useCallback((name: string): boolean => {
    if (!canRename) return false

    const nextName = name.trim()
    if (!nextName) {
      showMessage('Roadmap name cannot be empty.')
      return false
    }
    if (nextName.length > ROADMAP_NAME_MAX) {
      showMessage(`Roadmap name must be ${ROADMAP_NAME_MAX} characters or fewer.`)
      return false
    }

    const previousName = roadmapNameRef.current
    if (nextName === previousName) {
      showMessage(null)
      return true
    }

    // Local-only roadmaps retain their existing aggregate/local behavior.
    if (!serverRoadmapId || !sessionToken) {
      return onLocalRename?.(nextName) ?? false
    }

    showMessage(null)
    roadmapNameRef.current = nextName
    setRoadmapName(nextName)

    const work = async () => {
      try {
        const result = await patchRoadmapName(serverRoadmapId, nextName, sessionToken)
        // A queued older response must never overwrite a newer optimistic rename.
        if (roadmapNameRef.current === nextName) {
          roadmapNameRef.current = result.roadmapName
          setRoadmapName(result.roadmapName)
        }
        advanceUpdatedAt(result.updatedAt)
        showMessage(null)
      } catch (error) {
        const { kind, validationMessage } = classifyRoadmapSaveError(error)
        const rollback = () => {
          if (roadmapNameRef.current !== nextName) return
          roadmapNameRef.current = previousName
          setRoadmapName(previousName)
        }

        if (kind === 'session-expired' || kind === 'unauthorized') {
          rollback()
          onSessionExpired()
          showMessage('Session expired. Rejoin through an active invite link.')
          return
        }
        if (kind === 'forbidden') {
          rollback()
          showMessage('You do not have permission to rename this roadmap.')
          return
        }
        if (kind === 'validation') {
          rollback()
          showMessage(validationMessage ?? 'The server rejected this roadmap name.')
          return
        }

        // A connection/server outcome is ambiguous: the rename may have committed
        // even when the response was lost. Keep the optimistic name as a local
        // recovery draft instead of undoing a potentially successful server write.
        setSaved(false)
        showMessage(
          kind === 'connection'
            ? 'Connection lost. Kept the roadmap name locally while RoadForge reconnects.'
            : 'Could not confirm the roadmap rename. Kept it locally for recovery.',
        )
      }
    }

    queueRef.current = queueRef.current.catch(() => undefined).then(work)
    return true
  }, [
    advanceUpdatedAt,
    canRename,
    onLocalRename,
    onSessionExpired,
    serverRoadmapId,
    sessionToken,
    setRoadmapName,
    setSaved,
    showMessage,
  ])

  return { handleRenameRoadmap }
}
