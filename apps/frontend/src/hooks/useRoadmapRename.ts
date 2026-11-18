'use client'

import { useCallback, useRef } from 'react'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
import {
  isNewerServerRevision,
  isOlderServerRevision,
  newestServerRevision,
} from '@/lib/server-revision'
import { storage } from '@/lib/storage'
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

function cachedServerRevision(): string | null {
  const activeId = storage.getActiveRoadmapId()
  if (!activeId) return null
  return storage.getRoadmapCache(activeId)?.updatedAt ?? null
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
  const renameGenerationRef = useRef(0)

  roadmapNameRef.current = roadmapName
  if (updatedAt && isNewerServerRevision(updatedAt, latestRevisionRef.current)) {
    latestRevisionRef.current = updatedAt
  }

  const advanceUpdatedAt = useCallback((candidate: string) => {
    const current = newestServerRevision(
      latestRevisionRef.current,
      cachedServerRevision(),
    )
    if (isOlderServerRevision(candidate, current)) return
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
    const generation = renameGenerationRef.current + 1
    renameGenerationRef.current = generation
    roadmapNameRef.current = nextName
    setRoadmapName(nextName)

    const work = async () => {
      try {
        const result = await patchRoadmapName(serverRoadmapId, nextName, sessionToken)
        const currentRevision = newestServerRevision(
          latestRevisionRef.current,
          cachedServerRevision(),
        )
        const responseIsStale = isOlderServerRevision(result.updatedAt, currentRevision)
        // A newer local rename owns the title even if this response is newer;
        // a newer realtime revision owns it even if this request resolves late.
        if (!responseIsStale && renameGenerationRef.current === generation) {
          roadmapNameRef.current = result.roadmapName
          setRoadmapName(result.roadmapName)
        }
        advanceUpdatedAt(result.updatedAt)
        showMessage(null)
      } catch (error) {
        const { kind, validationMessage } = classifyRoadmapSaveError(error)
        const rollback = () => {
          if (renameGenerationRef.current !== generation) return
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
