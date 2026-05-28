'use client'

import { useState, useCallback, useEffect, type Dispatch, type SetStateAction, type MutableRefObject } from 'react'
import type { Phase, ShareRole } from '@/types/roadmap'
import { storage } from '@/lib/storage'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot, type RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'
import { getRoadmap } from '@/services/roadmap-crud.service'
import { getEventTicket, subscribeToRoadmapEvents } from '@/services/roadmap-realtime.service'
import { getLocks } from '@/services/roadmap-locks.service'
import { isApiConnectionError, isSessionExpiredError } from '@/services/roadmap-http'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LockMap = Record<string, { participantId: string; displayName: string }>

interface RealtimeConnectionParams {
  serverRoadmapId: string | null
  sessionToken: string | null
  participantId: string | null
  role: ShareRole | null
  activeRoadmapId: string | null
}

interface RealtimeLifecycleParams {
  isHydratingServer: boolean
  backendUnavailableRoadmapId: string | null
  savedRef: MutableRefObject<boolean>
  showUpgradeNoticeOnce: (targetId: string, result: { changed: boolean; notices: RoadmapUpgradeNotice[] }) => void
  setBackendUnavailableRoadmapId: Dispatch<SetStateAction<string | null>>
}

interface RealtimeRoadmapStateParams {
  setRoadmapNameState: Dispatch<SetStateAction<string>>
  setPhasesState: Dispatch<SetStateAction<Phase[]>>
  setSavedState: Dispatch<SetStateAction<boolean>>
}

interface RealtimeSessionStateParams {
  setServerRoadmapIdState: Dispatch<SetStateAction<string | null>>
  setSessionTokenState: Dispatch<SetStateAction<string | null>>
  setParticipantIdState: Dispatch<SetStateAction<string | null>>
  setRoleState: Dispatch<SetStateAction<ShareRole | null>>
}

interface RealtimeMetadataStateParams {
  setOwnerDisplayNameState: Dispatch<SetStateAction<string | null>>
  setUpdatedAtState: Dispatch<SetStateAction<string | null>>
  setIsPasswordEnabledState: Dispatch<SetStateAction<boolean>>
}

interface RealtimeLockStateParams {
  setLocks: Dispatch<SetStateAction<LockMap>>
}

export interface UseRoadmapRealtimeParams {
  connection: RealtimeConnectionParams
  lifecycle: RealtimeLifecycleParams
  roadmapState: RealtimeRoadmapStateParams
  sessionState: RealtimeSessionStateParams
  metadataState: RealtimeMetadataStateParams
  lockState: RealtimeLockStateParams
}

export interface UseRoadmapRealtimeReturn {
  accessRevokedEvent: 'revoked' | 'deleted' | 'expired' | null
  clearAccessRevokedEvent: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRoadmapRealtime({
  connection,
  lifecycle,
  roadmapState,
  sessionState,
  metadataState,
  lockState,
}: UseRoadmapRealtimeParams): UseRoadmapRealtimeReturn {
  const { serverRoadmapId, sessionToken, participantId, role, activeRoadmapId } = connection
  const {
    isHydratingServer,
    backendUnavailableRoadmapId,
    savedRef,
    showUpgradeNoticeOnce,
    setBackendUnavailableRoadmapId,
  } = lifecycle
  const { setRoadmapNameState, setPhasesState, setSavedState } = roadmapState
  const { setServerRoadmapIdState, setSessionTokenState, setParticipantIdState, setRoleState } = sessionState
  const { setOwnerDisplayNameState, setUpdatedAtState, setIsPasswordEnabledState } = metadataState
  const { setLocks } = lockState
  const [accessRevokedEvent, setAccessRevokedEvent] = useState<'revoked' | 'deleted' | 'expired' | null>(null)

  // ─── Realtime subscription ───────────────────────────────────────────────────

  useEffect(() => {
    if (!serverRoadmapId || !sessionToken) return
    if (typeof document === 'undefined') return
    if (isHydratingServer) return
    if (backendUnavailableRoadmapId === serverRoadmapId) return

    let unsubscribe: (() => void) | null = null
    let hiddenAt: number | null = null

    const startSync = async () => {
      const subscribedActiveId = activeRoadmapId

      // Shared teardown for participant-revoked, roadmap-deleted, and expired-session events.
      // Closes the EventSource first (auth is no longer valid), then clears
      // auth cache while preserving the local roadmap cache.
      const handleAccessLoss = (kind: 'revoked' | 'deleted' | 'expired') => {
        if (unsubscribe) { unsubscribe(); unsubscribe = null }
        if (subscribedActiveId) {
          storage.setAuthCache(subscribedActiveId, null)
          const rc = storage.getRoadmapCache(subscribedActiveId)
          if (rc) storage.setRoadmapCache(subscribedActiveId, { ...rc, saved: false })
        }
        setServerRoadmapIdState(null)
        setSessionTokenState(null)
        setParticipantIdState(null)
        setRoleState(null)
        setSavedState(false)
        setAccessRevokedEvent(kind)
      }

      try {
        const activeLocks = await getLocks(serverRoadmapId, sessionToken)
        const lockMap: LockMap = {}
        for (const l of activeLocks) {
          lockMap[l.target] = { participantId: l.participant_id, displayName: l.display_name }
        }
        setLocks(lockMap)

        const { ticket } = await getEventTicket(serverRoadmapId, sessionToken)
        unsubscribe = subscribeToRoadmapEvents(serverRoadmapId, ticket, {
          onUpdated: (payload) => {
            if (payload.participant_id === participantId) return

            // If this client has pending unsynced changes, do NOT overwrite local
            // phases, roadmap name, or updatedAt — preserve the user's work and
            // keep the stale updatedAt so the next autosync sends an outdated
            // last_updated_at and receives a 409, surfacing as CONFLICT.
            if (savedRef.current === false) {
              return
            }

            getRoadmap(serverRoadmapId, sessionToken).then((loaded) => {
              let nextRoadmapName = loaded.roadmap.name
              let normalizedSsePhases = normalizePhasesProgress(loaded.phases)
              let nextSaved = true
              try {
                const upgraded = upgradeRoadmapSnapshot({
                  roadmapName: loaded.roadmap.name,
                  phases: loaded.phases,
                })
                nextRoadmapName = upgraded.roadmapName || loaded.roadmap.name
                normalizedSsePhases = normalizePhasesProgress(upgraded.phases)
                const canPersistUpgrade = role === 'owner' || role === 'editor'
                nextSaved = !(upgraded.changed && canPersistUpgrade)
                if (activeRoadmapId) showUpgradeNoticeOnce(activeRoadmapId, upgraded)
              } catch (err) {
                console.warn('Could not upgrade realtime roadmap snapshot:', err)
              }

              setRoadmapNameState(nextRoadmapName)
              setPhasesState(normalizedSsePhases)
              setOwnerDisplayNameState(loaded.ownerDisplayName)
              setUpdatedAtState(loaded.updatedAt)
              setIsPasswordEnabledState(!!loaded.roadmap.isPasswordEnabled)
              setSavedState(nextSaved)

              const activeId = storage.getActiveRoadmapId()
              if (activeId) {
                const rc = storage.getRoadmapCache(activeId)
                if (rc) {
                  storage.setRoadmapCache(activeId, {
                    ...rc,
                    roadmapName: nextRoadmapName,
                    phases: normalizedSsePhases,
                    saved: nextSaved,
                    ownerDisplayName: loaded.ownerDisplayName,
                    updatedAt: loaded.updatedAt,
                    isPasswordEnabled: !!loaded.roadmap.isPasswordEnabled,
                  })
                }
              }
            }).catch((err: unknown) => {
              if (isSessionExpiredError(err)) handleAccessLoss('expired')
            })
          },
          onLockAcquired: (payload) => {
            setLocks((prev) => ({
              ...prev,
              [payload.target]: { participantId: payload.participant_id, displayName: payload.display_name },
            }))
          },
          onLockReleased: (payload) => {
            setLocks((prev) => {
              const next = { ...prev }
              delete next[payload.target]
              return next
            })
          },
          onParticipantRevoked: (payload) => {
            if (payload.roadmap_id !== serverRoadmapId) return
            if (payload.participant_id !== participantId) return
            handleAccessLoss('revoked')
          },
          onRoadmapDeleted: (payload) => {
            if (payload.roadmap_id !== serverRoadmapId) return
            handleAccessLoss('deleted')
          },
        })
      } catch (err) {
        if (isApiConnectionError(err)) {
          setBackendUnavailableRoadmapId(serverRoadmapId)
          console.warn('Realtime sync paused; RoadForge API is unavailable.')
          return
        }
        if (isSessionExpiredError(err)) {
          handleAccessLoss('expired')
          return
        }
        console.error('Realtime sync failed', err)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        if (hiddenAt && now - hiddenAt > 60_000) {
          if (unsubscribe) unsubscribe()
          startSync()
        }
        hiddenAt = null
      } else {
        hiddenAt = Date.now()
      }
    }

    startSync()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (unsubscribe) unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [serverRoadmapId, sessionToken, participantId, role, activeRoadmapId, isHydratingServer, backendUnavailableRoadmapId, showUpgradeNoticeOnce, setBackendUnavailableRoadmapId, savedRef, setLocks, setRoadmapNameState, setPhasesState, setOwnerDisplayNameState, setUpdatedAtState, setIsPasswordEnabledState, setSavedState, setServerRoadmapIdState, setSessionTokenState, setParticipantIdState, setRoleState])

  const clearAccessRevokedEvent = useCallback(() => {
    setAccessRevokedEvent(null)
  }, [])

  return { accessRevokedEvent, clearAccessRevokedEvent }
}
