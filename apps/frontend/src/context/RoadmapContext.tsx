'use client'

import { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import type {
  Phase,
  RealtimeConnectionStatus,
  ShareRole,
  TagDefinition,
} from '@/types/roadmap'
import { createRoadForgeTemplate } from '@/data/roadforge-template'
import { storage } from '@/lib/storage'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { isOlderServerRevision } from '@/lib/server-revision'
import { useRoadmapHydration } from '@/hooks/useRoadmapHydration'
import { useRoadmapRealtime } from '@/hooks/useRoadmapRealtime'

// ─── Domain-sliced context types ──────────────────────────────────────────────
// Split into 3 contexts so components subscribe only to the slice they need.
// Phase.tsx only needs session data → avoids re-renders on every task toggle.

interface RoadmapDataContextValue {
  displayName: string
  setDisplayName: (name: string) => void
  roadmapName: string
  setRoadmapName: (name: string) => void
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  saved: boolean
  setSaved: (saved: boolean) => void
  isPasswordEnabled: boolean
  setIsPasswordEnabled: (value: boolean) => void
  ownerDisplayName: string | null
  setOwnerDisplayName: (value: string | null) => void
  updatedAt: string | null
  setUpdatedAt: (value: string | null) => void
  tagRegistry: TagDefinition[]
  setTagRegistry: (registry: TagDefinition[]) => void
  isSample: boolean
  setIsSample: (value: boolean) => void
  registerDirtyDraft?: (taskId: string, dirty: boolean) => void
  dirtyDraftCount?: number
}

interface RoadmapSessionContextValue {
  serverRoadmapId: string | null
  setServerRoadmapId: (id: string | null) => void
  sessionToken: string | null
  setSessionToken: (value: string | null) => void
  participantId: string | null
  setParticipantId: (value: string | null) => void
  role: ShareRole | null
  setRole: (value: ShareRole | null) => void
  locks: Record<string, { participantId: string; displayName: string }>
}

interface RoadmapLifecycleContextValue {
  activeRoadmapId: string | null
  activateRoadmap: (id: string) => void
  createLocalRoadmap: (
    name: string,
    phases: Phase[],
    tagRegistry?: TagDefinition[],
  ) => string
  resetToSample: () => void
  removeRoadmapFromBrowser: (id: string) => void
  accessRevokedEvent: 'revoked' | 'deleted' | 'expired' | null
  clearAccessRevokedEvent: () => void
  sessionExpiredRoadmapId: string | null
  clearSessionExpiredNotice: () => void
  realtimeStatus: RealtimeConnectionStatus
}

// Legacy combined interface - kept for backward compatibility
interface RoadmapContextValue extends
  RoadmapDataContextValue,
  RoadmapSessionContextValue,
  RoadmapLifecycleContextValue {}

const RoadmapDataContext = createContext<RoadmapDataContextValue | null>(null)
const RoadmapSessionContext = createContext<RoadmapSessionContextValue | null>(null)
const RoadmapLifecycleContext = createContext<RoadmapLifecycleContextValue | null>(null)
const RoadmapContext = createContext<RoadmapContextValue | null>(null)

export function RoadmapProvider({ children }: { children: ReactNode }) {
  const initialTemplate = useMemo(() => createRoadForgeTemplate(), [])
  const [displayName, setDisplayNameState] = useState('')
  const [roadmapName, setRoadmapNameState] = useState(initialTemplate.roadmapName)
  const [phases, setPhasesState] = useState<Phase[]>(initialTemplate.phases)
  const [saved, setSavedState] = useState(false)
  // Ref so SSE callbacks always read the current saved value without stale closure
  const savedRef = useRef(false)
  const [serverRoadmapId, setServerRoadmapIdState] = useState<string | null>(null)
  const [sessionToken, setSessionTokenState] = useState<string | null>(null)
  const [participantId, setParticipantIdState] = useState<string | null>(null)
  const [role, setRoleState] = useState<ShareRole | null>(null)
  const [isPasswordEnabled, setIsPasswordEnabledState] = useState(false)
  const [ownerDisplayName, setOwnerDisplayNameState] = useState<string | null>(null)
  const [updatedAt, setUpdatedAtState] = useState<string | null>(null)
  const [tagRegistry, setTagRegistryState] = useState<TagDefinition[]>(
    initialTemplate.tagRegistry,
  )
  const [isSample, setIsSample] = useState(false)
  const [locks, setLocks] = useState<Record<string, { participantId: string; displayName: string }>>({})
  const [activeRoadmapId, setActiveRoadmapIdState] = useState<string | null>(null)

  const [dirtyTaskIds, setDirtyTaskIds] = useState<Set<string>>(new Set())
  const registerDirtyDraft = useCallback((taskId: string, dirty: boolean) => {
    setDirtyTaskIds((prev) => {
      const next = new Set(prev)
      if (dirty) next.add(taskId)
      else next.delete(taskId)
      return next
    })
  }, [])
  const dirtyDraftCount = dirtyTaskIds.size

  // Keep ref current so SSE callbacks always read the latest value.
  // Active uncommitted form drafts count as unsaved state to protect them
  // from incoming remote full snapshot overwrites.
  savedRef.current = saved && dirtyDraftCount === 0

  const {
    isHydratingServer,
    backendUnavailableRoadmapId,
    sessionExpiredRoadmapId,
    activateRoadmap,
    createLocalRoadmap,
    resetToSample,
    removeRoadmapFromBrowser,
    setBackendUnavailableRoadmapId,
    setSessionExpiredRoadmapId,
  } = useRoadmapHydration({
    roadmapState: {
      setRoadmapNameState,
      setPhasesState,
      setSavedState,
      setActiveRoadmapIdState,
      setTagRegistryState,
    },
    sessionState: {
      setServerRoadmapIdState,
      setSessionTokenState,
      setParticipantIdState,
      setRoleState,
    },
    metadataState: {
      setDisplayNameState,
      setIsPasswordEnabledState,
      setOwnerDisplayNameState,
      setUpdatedAtState,
      setIsSampleState: setIsSample,
    },
    lifecycleState: {
      setLocks,
    },
  })

  // ─── Realtime subscription ───────────────────────────────────────────────────

  const {
    accessRevokedEvent,
    clearAccessRevokedEvent,
    realtimeStatus,
  } = useRoadmapRealtime({
    connection: {
      serverRoadmapId,
      sessionToken,
      participantId,
      role,
      activeRoadmapId,
    },
    lifecycle: {
      isHydratingServer,
      backendUnavailableRoadmapId,
      savedRef,
      setBackendUnavailableRoadmapId,
      isClean: saved && dirtyDraftCount === 0,
    },
    roadmapState: {
      setRoadmapNameState,
      setPhasesState,
      setSavedState,
      setTagRegistryState,
    },
    sessionState: {
      setServerRoadmapIdState,
      setSessionTokenState,
      setParticipantIdState,
      setRoleState,
    },
    metadataState: {
      setOwnerDisplayNameState,
      setUpdatedAtState,
      setIsPasswordEnabledState,
    },
    lockState: {
      setLocks,
    },
  })

  // ─── Write-through setters ────────────────────────────────────────────────────

  const setDisplayName = useCallback((name: string) => {
    setDisplayNameState(name)
    storage.setDisplayName(name)
  }, [])

  const setRoadmapName = useCallback((name: string) => {
    setRoadmapNameState(name)
    const id = storage.getActiveRoadmapId()
    if (id) {
      const rc = storage.getRoadmapCache(id)
      if (rc) storage.setRoadmapCache(id, { ...rc, roadmapName: name })
    }
  }, [])

  const setPhases = useCallback((p: Phase[]) => {
    const normalized = normalizePhasesProgress(p)
    setPhasesState(normalized)
    const id = storage.getActiveRoadmapId()
    if (id) {
      const rc = storage.getRoadmapCache(id)
      if (rc) storage.setRoadmapCache(id, { ...rc, phases: normalized })
    }
  }, [])

  const setSaved = useCallback((s: boolean) => {
    setSavedState(s)
    const id = storage.getActiveRoadmapId()
    if (id) {
      const rc = storage.getRoadmapCache(id)
      if (rc) storage.setRoadmapCache(id, { ...rc, saved: s })
    }
  }, [])

  const setServerRoadmapId = useCallback((id: string | null) => {
    setServerRoadmapIdState(id)
    const currentActiveId = storage.getActiveRoadmapId()

    if (id && currentActiveId && currentActiveId !== id) {
      // Migrate from local draft to server ID
      const rc = storage.getRoadmapCache(currentActiveId)
      const ac = storage.getAuthCache(currentActiveId)
      let writeSuccess = true
      if (rc) {
        writeSuccess = storage.setRoadmapCache(id, rc) && storage.getRoadmapCache(id) !== null
      }
      if (ac && writeSuccess) {
        writeSuccess = storage.setAuthCache(id, ac) && storage.getAuthCache(id) !== null
      }

      if (writeSuccess) {
        storage.clearRoadmapStorage(currentActiveId)
        storage.setActiveRoadmapId(id)
        storage.setLastRoadmapId(id)
        setActiveRoadmapIdState(id)
      }
    }

    const targetId = storage.getActiveRoadmapId()
    if (targetId) {
      if (id) {
        const ac = storage.getAuthCache(targetId)
        storage.setAuthCache(targetId, {
          ...(ac || { sessionToken: '', participantId: null, role: 'viewer' }),
          serverRoadmapId: id,
        })
      } else {
        storage.setAuthCache(targetId, null)
      }
    }
  }, [])

  const setSessionToken = useCallback((value: string | null) => {
    setSessionTokenState(value)
    const id = storage.getActiveRoadmapId()
    if (id && value) {
      const ac = storage.getAuthCache(id)
      storage.setAuthCache(id, { ...(ac || { serverRoadmapId: '', participantId: null, role: 'viewer' }), sessionToken: value })
    }
  }, [])

  const setParticipantId = useCallback((value: string | null) => {
    setParticipantIdState(value)
    const id = storage.getActiveRoadmapId()
    if (id) {
      const ac = storage.getAuthCache(id)
      if (ac) storage.setAuthCache(id, { ...ac, participantId: value })
    }
  }, [])

  const setRole = useCallback((value: ShareRole | null) => {
    setRoleState(value)
    const id = storage.getActiveRoadmapId()
    if (id && value) {
      const ac = storage.getAuthCache(id)
      if (ac) storage.setAuthCache(id, { ...ac, role: value })
    }
  }, [])

  const setIsPasswordEnabled = useCallback((value: boolean) => {
    setIsPasswordEnabledState(value)
    const id = storage.getActiveRoadmapId()
    if (id) {
      const rc = storage.getRoadmapCache(id)
      if (rc) storage.setRoadmapCache(id, { ...rc, isPasswordEnabled: value })
    }
  }, [])

  const setOwnerDisplayName = useCallback((value: string | null) => {
    setOwnerDisplayNameState(value)
    const id = storage.getActiveRoadmapId()
    if (id) {
      const rc = storage.getRoadmapCache(id)
      if (rc) storage.setRoadmapCache(id, { ...rc, ownerDisplayName: value })
    }
  }, [])

  const setUpdatedAt = useCallback((value: string | null) => {
    if (!value) {
      setUpdatedAtState(null)
      const id = storage.getActiveRoadmapId()
      if (id) {
        const rc = storage.getRoadmapCache(id)
        if (rc) storage.setRoadmapCache(id, { ...rc, updatedAt: null })
      }
      return
    }
    setUpdatedAtState((current) => {
      if (current && isOlderServerRevision(value, current)) {
        return current
      }
      const id = storage.getActiveRoadmapId()
      if (id) {
        const rc = storage.getRoadmapCache(id)
        if (rc) storage.setRoadmapCache(id, { ...rc, updatedAt: value })
      }
      return value
    })
  }, [])

  const setTagRegistry = useCallback((registry: TagDefinition[]) => {
    setTagRegistryState(registry)
    const id = storage.getActiveRoadmapId()
    if (id) {
      const rc = storage.getRoadmapCache(id)
      if (rc) storage.setRoadmapCache(id, { ...rc, tagRegistry: registry })
    }
  }, [])

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpiredRoadmapId(null)
  }, [setSessionExpiredRoadmapId])

  // ─── Slice values ──────────────────────────────────────────────────────────

  const dataValue = useMemo<RoadmapDataContextValue>(() => ({
    displayName, setDisplayName,
    roadmapName, setRoadmapName,
    phases, setPhases,
    saved, setSaved,
    isPasswordEnabled, setIsPasswordEnabled,
    ownerDisplayName, setOwnerDisplayName,
    updatedAt, setUpdatedAt,
    tagRegistry, setTagRegistry,
    isSample, setIsSample,
    registerDirtyDraft,
    dirtyDraftCount,
  }), [
    displayName,
    setDisplayName,
    roadmapName,
    setRoadmapName,
    phases,
    setPhases,
    saved,
    setSaved,
    isPasswordEnabled,
    setIsPasswordEnabled,
    ownerDisplayName,
    setOwnerDisplayName,
    updatedAt,
    setUpdatedAt,
    tagRegistry,
    setTagRegistry,
    isSample,
    setIsSample,
    registerDirtyDraft,
    dirtyDraftCount,
  ])

  const sessionValue = useMemo<RoadmapSessionContextValue>(() => ({
    serverRoadmapId, setServerRoadmapId,
    sessionToken, setSessionToken,
    participantId, setParticipantId,
    role, setRole,
    locks,
  }), [
    serverRoadmapId,
    setServerRoadmapId,
    sessionToken,
    setSessionToken,
    participantId,
    setParticipantId,
    role,
    setRole,
    locks,
  ])

  const lifecycleValue = useMemo<RoadmapLifecycleContextValue>(() => ({
    activeRoadmapId,
    activateRoadmap,
    createLocalRoadmap,
    resetToSample,
    removeRoadmapFromBrowser,
    accessRevokedEvent,
    clearAccessRevokedEvent,
    sessionExpiredRoadmapId,
    clearSessionExpiredNotice,
    realtimeStatus,
  }), [
    activeRoadmapId,
    activateRoadmap,
    createLocalRoadmap,
    resetToSample,
    removeRoadmapFromBrowser,
    accessRevokedEvent,
    clearAccessRevokedEvent,
    sessionExpiredRoadmapId,
    clearSessionExpiredNotice,
    realtimeStatus,
  ])

  const combinedValue = useMemo<RoadmapContextValue>(() => ({
    ...dataValue,
    ...sessionValue,
    ...lifecycleValue,
  }), [dataValue, sessionValue, lifecycleValue])

  return (
    <RoadmapDataContext.Provider value={dataValue}>
      <RoadmapSessionContext.Provider value={sessionValue}>
        <RoadmapLifecycleContext.Provider value={lifecycleValue}>
          <RoadmapContext.Provider value={combinedValue}>
            {children}
          </RoadmapContext.Provider>
        </RoadmapLifecycleContext.Provider>
      </RoadmapSessionContext.Provider>
    </RoadmapDataContext.Provider>
  )
}

// ─── Focused hooks (use these for precise subscriptions) ─────────────────────

export function useRoadmapData(): RoadmapDataContextValue {
  const ctx = useContext(RoadmapDataContext)
  if (!ctx) throw new Error('useRoadmapData must be used inside <RoadmapProvider>')
  return ctx
}

export function useRoadmapSession(): RoadmapSessionContextValue {
  const ctx = useContext(RoadmapSessionContext)
  if (!ctx) throw new Error('useRoadmapSession must be used inside <RoadmapProvider>')
  return ctx
}

export function useRoadmapLifecycle(): RoadmapLifecycleContextValue {
  const ctx = useContext(RoadmapLifecycleContext)
  if (!ctx) throw new Error('useRoadmapLifecycle must be used inside <RoadmapProvider>')
  return ctx
}

// ─── Legacy combined hook (backward compatible) ──────────────────────────────

export function useRoadmap(): RoadmapContextValue {
  const ctx = useContext(RoadmapContext)
  if (!ctx) throw new Error('useRoadmap must be used inside <RoadmapProvider>')
  return ctx
}
