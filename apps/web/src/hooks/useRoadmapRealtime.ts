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
import { mergeAuthoritativeTasksIntoLocalPhases } from '@/lib/realtime-task-merge'
import {
  mergeAuthoritativeTaskStructureIntoLocalPhases,
  type RealtimeTaskOrderScope,
} from '@/lib/realtime-task-structure-merge'
import {
  mergeAuthoritativePhaseStructureIntoLocalPhases,
  phaseIdsInSnapshot,
  taskIdsInSnapshot,
} from '@/lib/realtime-phase-structure-merge'
import {
  getRealtimePhaseFields,
  getRealtimeRoadmapFields,
  mergeAuthoritativePhaseFieldsIntoLocalPhases,
  type RealtimePhaseField,
  type RealtimeRoadmapField,
} from '@/lib/realtime-structure-merge'
import { isOlderServerRevision } from '@/lib/server-revision'
import { upgradeRoadmapSnapshot, type RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'
import { getRoadmap } from '@/services/roadmap-crud.service'
import {
  getEventTicket,
  subscribeToRoadmapEvents,
  type RoadmapUpdatedEventPayload,
} from '@/services/roadmap-realtime.service'
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

interface RealtimeRefreshRequest {
  full: boolean
  taskIds: Set<string>
  createdTaskIds: Set<string>
  deletedTaskIds: Set<string>
  taskOrderScopes: Map<string, RealtimeTaskOrderScope>
  phaseFields: Map<string, Set<RealtimePhaseField>>
  phaseStructureIds: Set<string>
  phaseOrderChanged: boolean
  roadmapFields: Set<RealtimeRoadmapField>
}

type ScopedApplyResult = 'applied' | 'stale' | 'unreconciled'

function taskOrderScopeKey(phaseId: string, parentId: string | null): string {
  return `${phaseId}\u0000${parentId ?? ''}`
}

function createRefreshRequest(full = false): RealtimeRefreshRequest {
  return {
    full,
    taskIds: new Set(),
    createdTaskIds: new Set(),
    deletedTaskIds: new Set(),
    taskOrderScopes: new Map(),
    phaseFields: new Map(),
    phaseStructureIds: new Set(),
    phaseOrderChanged: false,
    roadmapFields: new Set(),
  }
}

function cloneRefreshRequest(request: RealtimeRefreshRequest): RealtimeRefreshRequest {
  return {
    full: request.full,
    taskIds: new Set(request.taskIds),
    createdTaskIds: new Set(request.createdTaskIds),
    deletedTaskIds: new Set(request.deletedTaskIds),
    taskOrderScopes: new Map(request.taskOrderScopes),
    phaseFields: new Map(
      [...request.phaseFields].map(([phaseId, fields]) => [phaseId, new Set(fields)]),
    ),
    phaseStructureIds: new Set(request.phaseStructureIds),
    phaseOrderChanged: request.phaseOrderChanged,
    roadmapFields: new Set(request.roadmapFields),
  }
}

function mergeRefreshRequest(
  target: RealtimeRefreshRequest,
  source: RealtimeRefreshRequest,
): void {
  target.full ||= source.full
  target.phaseOrderChanged ||= source.phaseOrderChanged
  source.taskIds.forEach((taskId) => target.taskIds.add(taskId))
  source.createdTaskIds.forEach((taskId) => target.createdTaskIds.add(taskId))
  source.deletedTaskIds.forEach((taskId) => target.deletedTaskIds.add(taskId))
  source.taskOrderScopes.forEach((scope, key) => target.taskOrderScopes.set(key, scope))
  source.phaseStructureIds.forEach((phaseId) => target.phaseStructureIds.add(phaseId))
  source.roadmapFields.forEach((field) => target.roadmapFields.add(field))
  for (const [phaseId, fields] of source.phaseFields) {
    const targetFields = target.phaseFields.get(phaseId) ?? new Set<RealtimePhaseField>()
    fields.forEach((field) => targetFields.add(field))
    target.phaseFields.set(phaseId, targetFields)
  }
}

function hasScopedRefresh(request: RealtimeRefreshRequest): boolean {
  return request.taskIds.size > 0
    || request.createdTaskIds.size > 0
    || request.deletedTaskIds.size > 0
    || request.taskOrderScopes.size > 0
    || request.phaseFields.size > 0
    || request.phaseStructureIds.size > 0
    || request.phaseOrderChanged
    || request.roadmapFields.size > 0
}

function refreshRequestFromEvent(
  payload: RoadmapUpdatedEventPayload,
): RealtimeRefreshRequest | null {
  const request = createRefreshRequest(false)

  if (payload.task_operation === 'created') {
    if (payload.task_id) request.createdTaskIds.add(payload.task_id)
  } else if (payload.task_operation === 'deleted') {
    const deletedIds = payload.task_ids?.length
      ? payload.task_ids
      : payload.task_id ? [payload.task_id] : []
    deletedIds.forEach((taskId) => request.deletedTaskIds.add(taskId))
  } else if (payload.task_operation === 'reordered') {
    if (payload.phase_id) {
      const scope = {
        phaseId: payload.phase_id,
        parentId: payload.parent_id ?? null,
      }
      request.taskOrderScopes.set(
        taskOrderScopeKey(scope.phaseId, scope.parentId),
        scope,
      )
    }
  } else if (payload.task_id) {
    request.taskIds.add(payload.task_id)
  }

  if (payload.phase_operation === 'created' || payload.phase_operation === 'deleted') {
    if (payload.phase_id) {
      request.phaseStructureIds.add(payload.phase_id)
      request.phaseOrderChanged = true
    }
  } else if (payload.phase_operation === 'reordered') {
    request.phaseOrderChanged = true
  }

  if (payload.phase_id) {
    const fields = getRealtimePhaseFields(payload.changed_fields)
    if (fields.length > 0) {
      request.phaseFields.set(payload.phase_id, new Set(fields))
    }
  }

  for (const field of getRealtimeRoadmapFields(payload.roadmap_fields)) {
    request.roadmapFields.add(field)
  }

  return hasScopedRefresh(request) ? request : null
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
    // `backendUnavailableRoadmapId` is a UX signal (also set by initial
    // hydration failures), not a reconnect gate: a transient REST failure
    // here sets it and still schedules its own retry below, so bailing out
    // whenever it happens to be set would permanently disable realtime
    // recovery until something unrelated clears it.

    const subscribedActiveId = activeRoadmapId

    // Each connection attempt owns an immutable identity and its own
    // EventSource handle. Every callback registered on that EventSource
    // captures this exact object and checks `isCurrentAttempt` before
    // mutating any state, so a callback firing from an EventSource that has
    // since errored, been superseded by a newer attempt, or outlived access
    // loss can never mutate the replacement connection's locks, close the
    // replacement's EventSource, schedule a duplicate retry, or restore a
    // status the replacement didn't itself earn.
    interface ConnectionAttempt {
      unsubscribe: (() => void) | null
      aborted: boolean
      // Authoritative-refresh single-flight state lives per attempt so a stale
      // generation's in-flight/hung GET can never block or downgrade a newer
      // generation's mandatory resync.
      refreshInFlight: boolean
      refreshController: AbortController | null
      // Bursts are coalesced into one queued follow-up request. Scoped events
      // accumulate every affected task field, task structure, phase, and
      // roadmap field. A full refresh may be queued alongside those scopes:
      // if a dirty draft later prevents full replacement, the safe scopes are
      // still eligible to rebase.
      pendingRequest: RealtimeRefreshRequest | null
    }

    let currentAttempt: ConnectionAttempt | null = null
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

    // Idempotent: marks an attempt as done and closes its own EventSource,
    // never touching whatever `currentAttempt` may have moved on to.
    const closeAttempt = (attempt: ConnectionAttempt) => {
      attempt.aborted = true
      // A closed/superseded attempt must never resume or recover on its
      // own: abort whatever authoritative GET it may have in flight and
      // drop any follow-up it had queued - only the replacement attempt's
      // own connect flow (started elsewhere) is allowed to recover.
      attempt.refreshController?.abort()
      attempt.pendingRequest = null
      if (attempt.unsubscribe) {
        attempt.unsubscribe()
        attempt.unsubscribe = null
      }
    }

    // A GET that never responds (network black hole, hung server) must not
    // block recovery forever - this bounds it distinctly from a permanent
    // auth failure, which arrives via a 401/expired response, not a timeout.
    const AUTHORITATIVE_REFRESH_TIMEOUT_MS = 15_000

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

    // Scoped server mutations can be automatically rebased on top of
    // unrelated local unsaved edits. The browser cache is the same local
    // snapshot written by RoadmapContext's mutation setters, so this applies
    // all requested scopes as one atomic local-cache update and advances the
    // server revision only after every non-obsolete scope is proven reconciled.
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

      const localBeforeStructure = cached.phases
      const loadedPhaseIds = phaseIdsInSnapshot(loaded.phases)
      const loadedTaskIds = taskIdsInSnapshot(loaded.phases)
      const finalAbsentAffectedPhaseIds = new Set(
        [...request.phaseStructureIds].filter((phaseId) => !loadedPhaseIds.has(phaseId)),
      )
      const tasksRemovedByAffectedPhaseDeletion = new Set(
        localBeforeStructure
          .filter((phase) => finalAbsentAffectedPhaseIds.has(phase.id))
          .flatMap((phase) => phase.tasks.map((task) => task.id)),
      )

      let nextPhases = localBeforeStructure
      if (request.phaseStructureIds.size > 0 || request.phaseOrderChanged) {
        nextPhases = mergeAuthoritativePhaseStructureIntoLocalPhases(
          nextPhases,
          loaded.phases,
          request.phaseStructureIds,
          request.phaseOrderChanged,
        )
      }

      if (
        request.createdTaskIds.size > 0
        || request.deletedTaskIds.size > 0
        || request.taskOrderScopes.size > 0
      ) {
        const mergedTaskStructure = mergeAuthoritativeTaskStructureIntoLocalPhases(
          nextPhases,
          loaded.phases,
          request.createdTaskIds,
          request.deletedTaskIds,
          request.taskOrderScopes,
        )
        if (!mergedTaskStructure) return 'unreconciled'
        nextPhases = mergedTaskStructure
      }

      if (request.taskIds.size > 0) {
        const unexplainedMissingTask = [...request.taskIds].some((taskId) => (
          !loadedTaskIds.has(taskId)
          && !tasksRemovedByAffectedPhaseDeletion.has(taskId)
          && !request.deletedTaskIds.has(taskId)
        ))
        if (unexplainedMissingTask) return 'unreconciled'

        const effectiveTaskIds = new Set(
          [...request.taskIds].filter((taskId) => loadedTaskIds.has(taskId)),
        )
        if (effectiveTaskIds.size > 0) {
          const mergedTasks = mergeAuthoritativeTasksIntoLocalPhases(
            nextPhases,
            loaded.phases,
            effectiveTaskIds,
          )
          if (!mergedTasks) return 'unreconciled'
          nextPhases = mergedTasks
        }
      }

      if (request.phaseFields.size > 0) {
        const effectivePhaseFields = new Map<string, Set<RealtimePhaseField>>()
        for (const [phaseId, fields] of request.phaseFields) {
          if (!loadedPhaseIds.has(phaseId)) {
            if (finalAbsentAffectedPhaseIds.has(phaseId)) continue
            return 'unreconciled'
          }
          effectivePhaseFields.set(phaseId, fields)
        }
        if (effectivePhaseFields.size > 0) {
          const mergedPhaseFields = mergeAuthoritativePhaseFieldsIntoLocalPhases(
            nextPhases,
            loaded.phases,
            effectivePhaseFields,
          )
          if (!mergedPhaseFields) return 'unreconciled'
          nextPhases = mergedPhaseFields
        }
      }

      let nextRoadmapName = cached.roadmapName
      if (request.roadmapFields.has('name')) {
        nextRoadmapName = loaded.roadmap.name
      }

      if (
        request.taskIds.size > 0
        || request.createdTaskIds.size > 0
        || request.deletedTaskIds.size > 0
        || request.taskOrderScopes.size > 0
        || request.phaseFields.size > 0
        || request.phaseStructureIds.size > 0
        || request.phaseOrderChanged
      ) {
        setPhasesState(nextPhases)
      }
      if (request.roadmapFields.has('name')) {
        setRoadmapNameState(nextRoadmapName)
      }
      setUpdatedAtState(loaded.updatedAt)
      storage.setRoadmapCache(activeId, {
        ...cached,
        roadmapName: nextRoadmapName,
        phases: nextPhases,
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

    // Fetches a fresh authoritative snapshot and applies it only if
    // `attempt` is still current when the response arrives. A clean local
    // roadmap may accept a requested full refresh. A dirty roadmap never gets
    // replaced wholesale, but any task/phase/roadmap scopes carried by the
    // same refresh request are still rebased safely onto that draft.
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
        // A prior transient REST failure (here or during initial hydration)
        // may have flagged the backend as unavailable; a successful resync
        // means it is back, so the UX signal should reflect that.
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

    // Coalesces overlapping refresh triggers into at most one in-flight GET
    // plus one queued follow-up. The follow-up retains every focused scope
    // even if a full refresh is also requested, because a dirty draft may
    // block aggregate replacement while still allowing safe scoped rebases.
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
      // Starting a new attempt always supersedes whatever came before it.
      // Closing it here (idempotent if it already closed itself, e.g. via
      // its own onError) centralizes attempt teardown in one place instead
      // of every caller of startSync() having to remember to do it first.
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

        // Every attempt - first connect or retry - gets a fresh single-use ticket.
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

            // Focused task fields/structure, phase fields/structure, and
            // roadmap-name operations carry enough metadata to rebase only
            // their authoritative scope onto unrelated local work. This is
            // the shared-roadmap rule: normal collaborator actions become
            // visible directly instead of manufacturing a whole-roadmap
            // local/server choice.
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
            // An old EventSource's error must only ever close its own
            // handle and must never touch `connecting` or schedule a
            // retry on behalf of a replacement attempt already in
            // progress or already live.
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

    // A pending retry is accelerated (fired immediately) rather than waiting
    // out its backoff once the tab is visible again or the network reports
    // "online" - but a scheduled retry is required; this never starts a
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
          // startSync() itself closes whatever attempt is current before
          // starting the replacement, so no manual close is needed here.
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
