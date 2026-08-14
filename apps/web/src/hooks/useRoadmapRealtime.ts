'use client'

import {
  useState,
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from 'react'
import type {
  Phase,
  RealtimeConnectionStatus,
  ShareRole,
  TagDefinition,
} from '@/types/roadmap'
import { storage } from '@/lib/storage'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { buildRegistryFromPhases } from '@/lib/tag-registry'
import {
  cloneRealtimeRefreshRequest as cloneRefreshRequest,
  createRealtimeRefreshRequest as createRefreshRequest,
  hasScopedRealtimeRefresh as hasScopedRefresh,
  mergeRealtimeRefreshRequest as mergeRefreshRequest,
  realtimeRefreshRequestFromEvent as refreshRequestFromEvent,
  type RealtimeRefreshRequest,
} from '@/lib/realtime-refresh-request'
import { mergeAuthoritativeRealtimeScopes } from '@/lib/realtime-scoped-merge'
import { isOlderServerRevision } from '@/lib/server-revision'
import { upgradeRoadmapSnapshot, type RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'
import { getRoadmap } from '@/services/roadmap-crud.service'
import {
  getEventTicket,
  subscribeToRoadmapEvents,
} from '@/services/roadmap-realtime.service'
import { getLocks } from '@/services/roadmap-locks.service'
import { isApiConnectionError, isAuthError, isSessionExpiredError } from '@/services/roadmap-http'
import { computeReconnectDelayMs } from '@/lib/reconnect-backoff'

type LoadedRoadmap = Awaited<ReturnType<typeof getRoadmap>>
type ScopedApplyResult = 'applied' | 'stale' | 'unreconciled'

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
  const {
    setServerRoadmapIdState,
    setSessionTokenState,
    setParticipantIdState,
    setRoleState,
  } = sessionState
  const {
    setOwnerDisplayNameState,
    setUpdatedAtState,
    setIsPasswordEnabledState,
  } = metadataState
  const { setLocks } = lockState
  const [accessRevokedEvent, setAccessRevokedEvent] = useState<
    'revoked' | 'deleted' | 'expired' | null
  >(null)
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

    const subscribedActiveId = activeRoadmapId

    interface ConnectionAttempt {
      unsubscribe: (() => void) | null
      aborted: boolean
      refreshInFlight: boolean
      refreshController: AbortController | null
      // Bursts coalesce into one queued follow-up request. Full refresh and
      // task/phase/roadmap scopes coexist because a dirty draft may reject
      // aggregate replacement while still accepting every proven-safe scope.
      pendingRequest: RealtimeRefreshRequest | null
    }

    let currentAttempt: ConnectionAttempt | null = null
    let hiddenAt: number | null = null
    let cancelled = false
    let stopped = false
    let connecting = false
    let reconnectAttempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const isCurrentAttempt = (attempt: ConnectionAttempt) =>
      !cancelled && !stopped && !attempt.aborted && currentAttempt === attempt

    const activeCache = () => {
      const activeId = subscribedActiveId ?? storage.getActiveRoadmapId()
      if (!activeId) return null
      const cache = storage.getRoadmapCache(activeId)
      return cache ? { activeId, cache } : null
    }

    const loadedRevisionIsStale = (loaded: LoadedRoadmap): boolean => {
      const current = activeCache()?.cache.updatedAt ?? null
      return current !== null && isOlderServerRevision(loaded.updatedAt, current)
    }

    const closeAttempt = (attempt: ConnectionAttempt) => {
      attempt.aborted = true
      attempt.refreshController?.abort()
      attempt.pendingRequest = null
      if (attempt.unsubscribe) {
        attempt.unsubscribe()
        attempt.unsubscribe = null
      }
    }

    const AUTHORITATIVE_REFRESH_TIMEOUT_MS = 15_000

    const clearRetryTimer = () => {
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    const handleAccessLoss = (kind: 'revoked' | 'deleted' | 'expired') => {
      stopped = true
      clearRetryTimer()
      if (currentAttempt) closeAttempt(currentAttempt)
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

    // Full authoritative replacement is used only when the local roadmap is
    // clean. Dirty drafts are handled by the scoped merge path below.
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

      const current = activeCache()
      if (current) {
        storage.setRoadmapCache(current.activeId, {
          ...current.cache,
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

    // All queued focused scopes are reconciled atomically against the same
    // authoritative GET. The pure merge module owns deletion explanations,
    // task structure/order, deps-only events, task fields, phase structure/
    // fields, and roadmap fields. The revision advances only after every
    // non-obsolete scope is proven incorporated.
    const applyLoadedScopedUpdates = (
      loaded: LoadedRoadmap,
      request: RealtimeRefreshRequest,
    ): ScopedApplyResult => {
      const current = activeCache()
      if (!current) return 'unreconciled'
      const { activeId, cache: cached } = current
      if (
        cached.updatedAt !== null
        && isOlderServerRevision(loaded.updatedAt, cached.updatedAt)
      ) {
        return 'stale'
      }

      const merged = mergeAuthoritativeRealtimeScopes({
        localPhases: cached.phases,
        localRoadmapName: cached.roadmapName,
        serverPhases: loaded.phases,
        serverRoadmapName: loaded.roadmap.name,
        request,
      })
      if (!merged.reconciled) return 'unreconciled'

      if (merged.phasesChanged) setPhasesState(merged.phases)
      if (merged.roadmapNameChanged) setRoadmapNameState(merged.roadmapName)
      setUpdatedAtState(loaded.updatedAt)
      storage.setRoadmapCache(activeId, {
        ...cached,
        roadmapName: merged.roadmapName,
        phases: merged.phases,
        updatedAt: loaded.updatedAt,
      })
      return 'applied'
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

    const runAuthoritativeRefresh = async (
      attempt: ConnectionAttempt,
      request: RealtimeRefreshRequest,
    ) => {
      attempt.refreshInFlight = true
      setRealtimeStatus('updating')
      const controller = new AbortController()
      attempt.refreshController = controller
      const timeoutId = setTimeout(() => controller.abort(), AUTHORITATIVE_REFRESH_TIMEOUT_MS)
      try {
        const loaded = await getRoadmap(serverRoadmapId, sessionToken, {
          signal: controller.signal,
        })
        if (!isCurrentAttempt(attempt)) return

        let applied = false
        let stale = loadedRevisionIsStale(loaded)
        if (!stale && request.full && savedRef.current !== false) {
          applyLoadedRoadmap(loaded)
          applied = true
        } else if (!stale && hasScopedRefresh(request)) {
          const scopedResult = applyLoadedScopedUpdates(loaded, request)
          applied = scopedResult === 'applied'
          stale = scopedResult === 'stale'
        }

        if (!applied && !stale && hasScopedRefresh(request)) {
          console.warn(
            'Could not safely rebase a scoped realtime update onto the local draft; preserving the draft and its current server revision.',
          )
        }

        setRealtimeStatus('live')
        reconnectAttempt = 0
        setBackendUnavailableRoadmapId((currentRoadmapId) => (
          currentRoadmapId === serverRoadmapId ? null : currentRoadmapId
        ))
      } catch (err) {
        if (!isCurrentAttempt(attempt)) return
        if (isSessionExpiredError(err) || isAuthError(err)) {
          handleAccessLoss(isSessionExpiredError(err) ? 'expired' : 'revoked')
        } else {
          closeAttempt(attempt)
          setRealtimeStatus(isApiConnectionError(err) ? 'offline' : 'reconnecting')
          scheduleReconnect()
        }
      } finally {
        clearTimeout(timeoutId)
        attempt.refreshInFlight = false
        attempt.refreshController = null

        const pendingRequest = attempt.pendingRequest
        attempt.pendingRequest = null
        if (pendingRequest && isCurrentAttempt(attempt)) {
          void runAuthoritativeRefresh(attempt, pendingRequest)
        }
      }
    }

    const requestAuthoritativeRefresh = (
      attempt: ConnectionAttempt,
      request: RealtimeRefreshRequest,
    ) => {
      if (attempt.refreshInFlight) {
        if (!attempt.pendingRequest) {
          attempt.pendingRequest = cloneRefreshRequest(request)
        } else {
          mergeRefreshRequest(attempt.pendingRequest, request)
        }
        return
      }

      void runAuthoritativeRefresh(attempt, cloneRefreshRequest(request))
    }

    const startSync = async (isReconnect = false) => {
      if (stopped || cancelled || connecting) return
      connecting = true
      if (currentAttempt) closeAttempt(currentAttempt)
      const attempt: ConnectionAttempt = {
        unsubscribe: null,
        aborted: false,
        refreshInFlight: false,
        refreshController: null,
        pendingRequest: null,
      }
      currentAttempt = attempt
      clearRetryTimer()
      setRealtimeStatus(isReconnect ? 'reconnecting' : 'connecting')

      try {
        const activeLocks = await getLocks(serverRoadmapId, sessionToken)
        if (!isCurrentAttempt(attempt)) {
          connecting = false
          return
        }
        const lockMap: LockMap = {}
        for (const l of activeLocks) {
          lockMap[l.target] = {
            participantId: l.participant_id,
            displayName: l.display_name,
          }
        }
        setLocks(lockMap)

        await getEventTicket(serverRoadmapId, sessionToken)
        if (!isCurrentAttempt(attempt)) {
          connecting = false
          return
        }
        attempt.unsubscribe = subscribeToRoadmapEvents(serverRoadmapId, {
          onOpen: () => {
            if (!isCurrentAttempt(attempt)) return
            connecting = false
            requestAuthoritativeRefresh(attempt, createRefreshRequest(true))
          },
          onUpdated: (payload) => {
            if (payload.participant_id === participantId) return
            if (!isCurrentAttempt(attempt)) return

            // Focused task fields/structure/dependencies, phase fields/
            // structure, and roadmap-name operations carry enough metadata to
            // rebase only their authoritative scope onto unrelated local work.
            const scopedRequest = refreshRequestFromEvent(payload)
            if (scopedRequest) {
              requestAuthoritativeRefresh(attempt, scopedRequest)
              return
            }

            // Aggregate operations still cannot be proven safe to merge
            // field-by-field. Preserve a dirty aggregate draft until those
            // mutation surfaces are converted to focused server operations.
            if (savedRef.current === false) return

            requestAuthoritativeRefresh(attempt, createRefreshRequest(true))
          },
          onLockAcquired: (payload) => {
            if (!isCurrentAttempt(attempt)) return
            setLocks((prev) => ({
              ...prev,
              [payload.target]: {
                participantId: payload.participant_id,
                displayName: payload.display_name,
              },
            }))
          },
          onLockReleased: (payload) => {
            if (!isCurrentAttempt(attempt)) return
            setLocks((prev) => {
              const next = { ...prev }
              delete next[payload.target]
              return next
            })
          },
          onParticipantRevoked: (payload) => {
            if (!isCurrentAttempt(attempt)) return
            if (payload.roadmap_id !== serverRoadmapId) return
            if (payload.participant_id !== participantId) return
            handleAccessLoss('revoked')
          },
          onRoadmapDeleted: (payload) => {
            if (!isCurrentAttempt(attempt)) return
            if (payload.roadmap_id !== serverRoadmapId) return
            handleAccessLoss('deleted')
          },
          onError: () => {
            if (!isCurrentAttempt(attempt)) return
            connecting = false
            closeAttempt(attempt)
            if (stopped || cancelled) return
            setRealtimeStatus('reconnecting')
            scheduleReconnect()
          },
        })
      } catch (err) {
        connecting = false
        if (!isCurrentAttempt(attempt)) return
        if (isSessionExpiredError(err) || isAuthError(err)) {
          handleAccessLoss(isSessionExpiredError(err) ? 'expired' : 'revoked')
          return
        }
        if (isApiConnectionError(err)) {
          setRealtimeStatus('offline')
          setBackendUnavailableRoadmapId(serverRoadmapId)
          console.warn('Realtime sync paused; RoadForge API is unavailable.')
          scheduleReconnect()
          return
        }
        setRealtimeStatus('reconnecting')
        console.error('Realtime sync failed', err)
        scheduleReconnect()
      }
    }

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
      if (currentAttempt) closeAttempt(currentAttempt)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
    }
  }, [
    serverRoadmapId,
    sessionToken,
    participantId,
    role,
    activeRoadmapId,
    isHydratingServer,
    showUpgradeNoticeOnce,
    setBackendUnavailableRoadmapId,
    savedRef,
    setLocks,
    setRoadmapNameState,
    setPhasesState,
    setTagRegistryState,
    setOwnerDisplayNameState,
    setUpdatedAtState,
    setIsPasswordEnabledState,
    setSavedState,
    setServerRoadmapIdState,
    setSessionTokenState,
    setParticipantIdState,
    setRoleState,
  ])

  const clearAccessRevokedEvent = useCallback(() => {
    setAccessRevokedEvent(null)
  }, [])

  return { accessRevokedEvent, clearAccessRevokedEvent, realtimeStatus }
}
