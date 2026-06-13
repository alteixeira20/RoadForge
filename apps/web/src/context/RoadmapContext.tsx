'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import type { Phase, ShareRole, TagDefinition } from '@/types/roadmap'
import { SAMPLE_ROADMAP } from '@/data/sample-roadmap'
import { storage } from '@/lib/storage'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { useRoadmapHydration, type RoadmapUpgradeState } from '@/hooks/useRoadmapHydration'
import { useRoadmapRealtime } from '@/hooks/useRoadmapRealtime'

interface RoadmapContextValue {
  displayName: string
  setDisplayName: (name: string) => void
  roadmapName: string
  setRoadmapName: (name: string) => void
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  saved: boolean
  setSaved: (saved: boolean) => void
  serverRoadmapId: string | null
  setServerRoadmapId: (id: string | null) => void
  sessionToken: string | null
  setSessionToken: (value: string | null) => void
  participantId: string | null
  setParticipantId: (value: string | null) => void
  role: ShareRole | null
  setRole: (value: ShareRole | null) => void
  isPasswordEnabled: boolean
  setIsPasswordEnabled: (value: boolean) => void
  ownerDisplayName: string | null
  setOwnerDisplayName: (value: string | null) => void
  updatedAt: string | null
  setUpdatedAt: (value: string | null) => void
  tagRegistry: TagDefinition[]
  setTagRegistry: (registry: TagDefinition[]) => void
  locks: Record<string, { participantId: string; displayName: string }>
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
  roadmapUpgradeNotice: RoadmapUpgradeState | null
  dismissRoadmapUpgradeNotice: () => void
}

const RoadmapContext = createContext<RoadmapContextValue | null>(null)

export function RoadmapProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayNameState] = useState('')
  const [roadmapName, setRoadmapNameState] = useState('v1.0 Public Launch')
  const [phases, setPhasesState] = useState<Phase[]>(SAMPLE_ROADMAP.phases)
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
  const [tagRegistry, setTagRegistryState] = useState<TagDefinition[]>([])
  const [locks, setLocks] = useState<Record<string, { participantId: string; displayName: string }>>({})
  const [activeRoadmapId, setActiveRoadmapIdState] = useState<string | null>(null)
  const [roadmapUpgradeNotice, setRoadmapUpgradeNotice] = useState<RoadmapUpgradeState | null>(null)

  // Keep ref current so SSE callbacks always read the latest value
  savedRef.current = saved

  const {
    isHydratingServer,
    backendUnavailableRoadmapId,
    sessionExpiredRoadmapId,
    showUpgradeNoticeOnce,
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
    },
    lifecycleState: {
      setLocks,
      setRoadmapUpgradeNotice,
    },
  })

  // ─── Realtime subscription ───────────────────────────────────────────────────

  const { accessRevokedEvent, clearAccessRevokedEvent } = useRoadmapRealtime({
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
      showUpgradeNoticeOnce,
      setBackendUnavailableRoadmapId,
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
      if (rc) storage.setRoadmapCache(id, rc)
      const ac = storage.getAuthCache(currentActiveId)
      if (ac) storage.setAuthCache(id, ac)

      storage.clearRoadmapCache(currentActiveId)
      storage.setActiveRoadmapId(id)
      storage.setLastRoadmapId(id)
      setActiveRoadmapIdState(id)
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
    setUpdatedAtState(value)
    const id = storage.getActiveRoadmapId()
    if (id) {
      const rc = storage.getRoadmapCache(id)
      if (rc) storage.setRoadmapCache(id, { ...rc, updatedAt: value })
    }
  }, [])

  const setTagRegistry = useCallback((registry: TagDefinition[]) => {
    setTagRegistryState(registry)
    const id = storage.getActiveRoadmapId()
    if (id) {
      const rc = storage.getRoadmapCache(id)
      if (rc) storage.setRoadmapCache(id, { ...rc, tagRegistry: registry })
    }
  }, [])

  const dismissRoadmapUpgradeNotice = useCallback(() => {
    setRoadmapUpgradeNotice(null)
  }, [])

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpiredRoadmapId(null)
  }, [setSessionExpiredRoadmapId])

  return (
    <RoadmapContext.Provider
      value={{ displayName, setDisplayName, roadmapName, setRoadmapName, phases, setPhases, saved, setSaved, serverRoadmapId, setServerRoadmapId, sessionToken, setSessionToken, participantId, setParticipantId, role, setRole, isPasswordEnabled, setIsPasswordEnabled, ownerDisplayName, setOwnerDisplayName, updatedAt, setUpdatedAt, tagRegistry, setTagRegistry, locks, activeRoadmapId, activateRoadmap, createLocalRoadmap, resetToSample, removeRoadmapFromBrowser, accessRevokedEvent, clearAccessRevokedEvent, sessionExpiredRoadmapId, clearSessionExpiredNotice, roadmapUpgradeNotice, dismissRoadmapUpgradeNotice }}
    >
      {children}
    </RoadmapContext.Provider>
  )
}

export function useRoadmap(): RoadmapContextValue {
  const ctx = useContext(RoadmapContext)
  if (!ctx) throw new Error('useRoadmap must be used inside <RoadmapProvider>')
  return ctx
}
