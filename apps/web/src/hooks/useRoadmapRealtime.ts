'use client'

import { useState, useCallback, useEffect, type Dispatch, type SetStateAction, type MutableRefObject } from 'react'
import type {
  Phase,
  RealtimeConnectionStatus,
  ShareRole,
  TagDefinition,
} from '@/types/roadmap'
import { storage } from '@/lib/storage'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { buildRegistryFromPhases } from '@/lib/tag-registry'
import { upgradeRoadmapSnapshot, type RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'
import { getRoadmap } from '@/services/roadmap-crud.service'
import { getEventTicket, subscribeToRoadmapEvents } from '@/services/roadmap-realtime.service'
import { getLocks } from '@/services/roadmap-locks.service'
import { isApiConnectionError, isAuthError, isSessionExpiredError } from '@/services/roadmap-http'
import { computeReconnectDelayMs } from '@/lib/reconnect-backoff'

type LoadedRoadmap = Awaited<ReturnType<typeof getRoadmap>>

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
  showUpgradeNoticeOnce: (
    targetId: string,
    updatedAt: string | null,
    result: { changed: boolean; notices: RoadmapUpgradeNotice[] },
  ) => void
  setBackendUnavailableRoadmapId: Dispatch<SetStateAction<string | null>>
}

interface RealtimeRoadmapStateParams {
  setRoadmapNameState: Dispatch<SetStateAction<string>>
  setPhasesState: Dispatch<SetStateAction<Phase[]>>
  setSavedState: Dispatch<SetStateAction<boolean>>
  setTagRegistryState: Dispatch<SetStateAction<TagDefinition[]>>
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
  realtimeStatus: RealtimeConnectionStatus
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
  const {
    setRoadmapNameState,
    setPhasesState,
    setSavedState,
    setTagRegistryState,
  } = roadmapState
  const { setServerRoadmapIdState, setSessionTokenState, setParticipantIdState, setRoleState } = sessionState
  const { setOwnerDisplayNameState, setUpdatedAtState, setIsPasswordEnabledState } = metadataState
  const { setLocks } = lockState
  const [accessRevokedEvent, setAccessRevokedEvent] = useState<'revoked' | 'deleted' | 'expired' | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>('local')

  useEffect(() => {
    if (!serverRoadmapId || !sessionToken) {
      setRealtimeStatus('local')
    } else if (backendUnavailableRoadmapId === serverRoadmapId) {
      setRealtimeStatus('offline')
    } else if (isHydratingServer) {
      setRealtimeStatus('connecting')
    }
  }, [
    backendUnavailableRoadmapId,
    isHydratingServer,
    serverRoadmapId,
    sessionToken,
  ])

  // ─── Realtime subscription ───────────────────────────────────────────────────
  // Connection state machine: connecting/reconnecting -> live, with an
  // `updating` (resync) step gating every transition into `live` on a fresh
  // authoritative GET. Reconnect attempts use exponential backoff with
  // jitter (see lib/reconnect-backoff), always fetch a brand-new single-use
  // ticket, never overlap, and stop permanently on revocation/deletion/
  // session-expiry/definitive auth failure or on unmount/roadmap change.

  useEffect(() => {
    if (!serverRoadmapId || !sessionToken) return
    if (typeof document === 'undefined') return
    if (isHydratingServer) return
    if (backendUnavailableRoadmapId === serverRoadmapId) return

    const subscribedActiveId = activeRoadmapId

    let unsubscribe: (() => void) | null = null
    let hiddenAt: number | null = null
    // Guards against a startSync() call resuming after this effect has
    // already been cleaned up (e.g. the active roadmap changed mid-await).
    let cancelled = false
    // Set once access is permanently lost (or on cleanup) so no further
    // connection attempt or scheduled retry can fire afterward.
    let stopped = false
    // Prevents two connection attempts from ever running concurrently
    // (e.g. a visibility/online wake racing a scheduled retry).
    let connecting = false
    let reconnectAttempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    // Bumped every time a connection attempt starts or its EventSource is
    // torn down (error, access loss, replacement). Every async continuation
    // below captures the generation active when it started and checks it's
    // still current before mutating state, so a stale lock/ticket fetch, a
    // post-open resync superseded by a new attempt, or a resync that
    // outlives an EventSource error can never apply results or flip status
    // back to `live`.
    let connectionGeneration = 0
    const isCurrentGeneration = (generation: number) =>
      !cancelled && !stopped && generation === connectionGeneration

    // Authoritative-refresh single-flight state, shared by the post-open
    // resync and every `roadmap.updated` refetch: at most one GET is ever
    // in flight, and a refresh requested while one is already running is
    // coalesced into a single follow-up instead of firing its own
    // overlapping request — so an older response can never apply after a
    // newer one already has.
    //
    // `pendingRefresh` carries its own generation rather than inheriting
    // the generation of whichever request happens to be in flight when it
    // is queued: a later generation's mandatory post-open resync can be
    // queued behind an older (superseded) generation's still-in-flight
    // request, and that older request's `finally` must launch the queued
    // follow-up under *its* generation, not bail out just because the
    // generation has since moved on.
    let refreshInFlight = false
    let pendingRefresh: { generation: number; onLive: boolean } | null = null

    const clearRetryTimer = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    // Shared teardown for participant-revoked, roadmap-deleted, and expired/invalid-session
    // outcomes. Closes the EventSource first (auth is no longer valid), stops all future
    // reconnect attempts, then clears auth cache while preserving the local roadmap cache.
    const handleAccessLoss = (kind: 'revoked' | 'deleted' | 'expired') => {
      stopped = true
      connectionGeneration += 1
      clearRetryTimer()
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
      setRealtimeStatus('access-lost')
      setAccessRevokedEvent(kind)
    }

    // Applies an authoritative snapshot fetched from the server (used by both
    // the post-event refetch and the post-reconnect resync). Local unsaved
    // drafts are preserved by callers checking `savedRef` before invoking this.
    const applyLoadedRoadmap = (loaded: LoadedRoadmap) => {
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
        if (activeRoadmapId) {
          showUpgradeNoticeOnce(activeRoadmapId, loaded.updatedAt, upgraded)
        }
      } catch (err) {
        console.warn('Could not upgrade realtime roadmap snapshot:', err)
      }

      setRoadmapNameState(nextRoadmapName)
      setPhasesState(normalizedSsePhases)
      const nextRegistry = loaded.tagRegistry?.length
        ? loaded.tagRegistry
        : buildRegistryFromPhases(normalizedSsePhases)
      setTagRegistryState(nextRegistry)
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
            tagRegistry: nextRegistry,
            saved: nextSaved,
            ownerDisplayName: loaded.ownerDisplayName,
            updatedAt: loaded.updatedAt,
            isPasswordEnabled: !!loaded.roadmap.isPasswordEnabled,
          })
        }
      }
    }

    const scheduleReconnect = () => {
      if (stopped || cancelled) return
      clearRetryTimer()
      const attempt = reconnectAttempt
      reconnectAttempt += 1
      const delay = computeReconnectDelayMs(attempt)
      retryTimer = setTimeout(() => {
        retryTimer = null
        void startSync(true)
      }, delay)
    }

    // Fetches a fresh authoritative snapshot and applies it only if
    // `generation` is still current when the response arrives — this is
    // what gates the transition into `live`, so a reconnect (or a stale
    // resync outlived by an EventSource error, revocation, or a newer
    // connection attempt) can never be falsely reported as live or apply an
    // outdated snapshot. `onLive` distinguishes the post-open resync (a
    // failure means the handshake never completed, so the EventSource is
    // dropped and a reconnect is scheduled) from an update-triggered
    // refetch (the connection is already live; a failure just reports
    // status without tearing anything down).
    const runAuthoritativeRefresh = async (generation: number, opts: { onLive: boolean }) => {
      refreshInFlight = true
      setRealtimeStatus('updating')
      try {
        const loaded = await getRoadmap(serverRoadmapId, sessionToken)
        if (isCurrentGeneration(generation)) {
          // Preserve local unsaved work: don't clobber it with the server
          // snapshot, but the connection itself is genuinely live.
          if (savedRef.current !== false) {
            applyLoadedRoadmap(loaded)
          }
          setRealtimeStatus('live')
          reconnectAttempt = 0
        }
      } catch (err) {
        if (isCurrentGeneration(generation)) {
          if (isSessionExpiredError(err) || isAuthError(err)) {
            handleAccessLoss(isSessionExpiredError(err) ? 'expired' : 'revoked')
          } else if (opts.onLive) {
            if (unsubscribe) { unsubscribe(); unsubscribe = null }
            setRealtimeStatus(isApiConnectionError(err) ? 'offline' : 'reconnecting')
            scheduleReconnect()
          } else {
            setRealtimeStatus(isApiConnectionError(err) ? 'offline' : 'reconnecting')
          }
        }
      } finally {
        refreshInFlight = false
        const next = pendingRefresh
        pendingRefresh = null
        // Launch the queued follow-up under *its own* generation — it may
        // belong to a newer connection attempt than the request that just
        // finished, so checking `generation` (the finishing request's) here
        // would wrongly drop a still-current, newer generation's mandatory
        // resync just because an older one happened to be in flight when it
        // was requested.
        if (next && isCurrentGeneration(next.generation)) {
          void runAuthoritativeRefresh(next.generation, { onLive: next.onLive })
        }
      }
    }

    // Coalesces overlapping refresh triggers (e.g. a burst of
    // `roadmap.updated` events) into at most one in-flight request plus one
    // queued follow-up, instead of racing multiple GETs whose responses
    // could otherwise be applied out of order.
    const requestAuthoritativeRefresh = (generation: number, opts: { onLive: boolean }) => {
      if (refreshInFlight) {
        pendingRefresh = { generation, ...opts }
        return
      }
      void runAuthoritativeRefresh(generation, opts)
    }

    const startSync = async (isReconnect = false) => {
      if (stopped || cancelled || connecting) return
      connecting = true
      connectionGeneration += 1
      const myGeneration = connectionGeneration
      clearRetryTimer()
      setRealtimeStatus(isReconnect ? 'reconnecting' : 'connecting')

      try {
        const activeLocks = await getLocks(serverRoadmapId, sessionToken)
        if (!isCurrentGeneration(myGeneration)) { connecting = false; return }
        const lockMap: LockMap = {}
        for (const l of activeLocks) {
          lockMap[l.target] = { participantId: l.participant_id, displayName: l.display_name }
        }
        setLocks(lockMap)

        // Every attempt — first connect or retry — gets a fresh single-use ticket.
        const { ticket } = await getEventTicket(serverRoadmapId, sessionToken)
        if (!isCurrentGeneration(myGeneration)) { connecting = false; return }
        unsubscribe = subscribeToRoadmapEvents(serverRoadmapId, ticket, {
          onOpen: () => {
            connecting = false
            if (!isCurrentGeneration(myGeneration)) return
            requestAuthoritativeRefresh(myGeneration, { onLive: true })
          },
          onUpdated: (payload) => {
            if (payload.participant_id === participantId) return
            if (!isCurrentGeneration(myGeneration)) return

            // If this client has pending unsynced changes, do NOT overwrite local
            // phases, roadmap name, or updatedAt — preserve the user's work and
            // keep the stale updatedAt so the next autosync sends an outdated
            // last_updated_at and receives a 409, surfacing as CONFLICT.
            if (savedRef.current === false) {
              return
            }

            requestAuthoritativeRefresh(myGeneration, { onLive: false })
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
          onError: () => {
            connecting = false
            if (unsubscribe) { unsubscribe(); unsubscribe = null }
            // Invalidate this attempt's generation even when not (yet)
            // permanently stopped, so a post-open resync in flight when the
            // EventSource drops can no longer restore `live`.
            connectionGeneration += 1
            if (stopped || cancelled) return
            setRealtimeStatus('reconnecting')
            scheduleReconnect()
          },
        })
      } catch (err) {
        connecting = false
        if (!isCurrentGeneration(myGeneration)) return
        if (isSessionExpiredError(err) || isAuthError(err)) {
          handleAccessLoss(isSessionExpiredError(err) ? 'expired' : 'revoked')
          return
        }
        if (isApiConnectionError(err)) {
          setRealtimeStatus('offline')
          setBackendUnavailableRoadmapId(serverRoadmapId)
          console.warn('Realtime sync paused; RoadForge API is unavailable.')
          return
        }
        setRealtimeStatus('reconnecting')
        console.error('Realtime sync failed', err)
        scheduleReconnect()
      }
    }

    // A pending retry is accelerated (fired immediately) rather than waiting
    // out its backoff once the tab is visible again or the network reports
    // "online" — but a scheduled retry is required; this never starts a
    // connection on its own.
    const wakeIfPending = () => {
      if (stopped || cancelled || retryTimer === null) return
      clearRetryTimer()
      void startSync(true)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        const wasHiddenLong = hiddenAt !== null && now - hiddenAt > 60_000
        hiddenAt = null
        if (wasHiddenLong) {
          if (unsubscribe) { unsubscribe(); unsubscribe = null }
          clearRetryTimer()
          void startSync(true)
        } else {
          wakeIfPending()
        }
      } else {
        hiddenAt = Date.now()
      }
    }

    const handleOnline = () => {
      wakeIfPending()
    }

    void startSync()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      stopped = true
      clearRetryTimer()
      if (unsubscribe) unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
    }
  }, [serverRoadmapId, sessionToken, participantId, role, activeRoadmapId, isHydratingServer, backendUnavailableRoadmapId, showUpgradeNoticeOnce, setBackendUnavailableRoadmapId, savedRef, setLocks, setRoadmapNameState, setPhasesState, setTagRegistryState, setOwnerDisplayNameState, setUpdatedAtState, setIsPasswordEnabledState, setSavedState, setServerRoadmapIdState, setSessionTokenState, setParticipantIdState, setRoleState])

  const clearAccessRevokedEvent = useCallback(() => {
    setAccessRevokedEvent(null)
  }, [])

  return { accessRevokedEvent, clearAccessRevokedEvent, realtimeStatus }
}
