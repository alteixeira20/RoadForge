'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import type { Phase, ShareRole } from '@/types/roadmap'
import { SAMPLE_ROADMAP } from '@/data/sample-roadmap'
import { storage, type RoadmapCache } from '@/lib/storage'
import {
  getRoadmap,
  getEventTicket,
  subscribeToRoadmapEvents,
  getLocks,
  isApiConnectionError,
} from '@/services/roadmap.service'

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
  locks: Record<string, { participantId: string; displayName: string }>
  activeRoadmapId: string | null
  activateRoadmap: (id: string) => void
  createLocalRoadmap: (name: string, phases: Phase[]) => string
  resetToSample: () => void
  removeRoadmapFromBrowser: (id: string) => void
}

const RoadmapContext = createContext<RoadmapContextValue | null>(null)

function isAuthError(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes('401') || error.message.includes('403')
  )
}

function getRoadmapIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return new URLSearchParams(window.location.search).get('roadmap')
  } catch {
    return null
  }
}

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
  const [locks, setLocks] = useState<Record<string, { participantId: string; displayName: string }>>({})
  const [activeRoadmapId, setActiveRoadmapIdState] = useState<string | null>(null)
  const [isHydratingServer, setIsHydratingServer] = useState(false)
  const [backendUnavailableRoadmapId, setBackendUnavailableRoadmapId] = useState<string | null>(null)

  // Keep ref current so SSE callbacks always read the latest value
  savedRef.current = saved

  const loadRoadmapIntoState = useCallback((targetId: string, cancelled: { value: boolean }) => {
    const rc = storage.getRoadmapCache(targetId)
    const ac = storage.getAuthCache(targetId)
    setBackendUnavailableRoadmapId(null)

    if (rc) {
      setRoadmapNameState(rc.roadmapName)
      setPhasesState(rc.phases)
      setSavedState(rc.saved)
      setOwnerDisplayNameState(rc.ownerDisplayName)
      setUpdatedAtState(rc.updatedAt)
      setIsPasswordEnabledState(rc.isPasswordEnabled)
    }

    if (ac) {
      setServerRoadmapIdState(ac.serverRoadmapId)
      setSessionTokenState(ac.sessionToken)
      setParticipantIdState(ac.participantId)
      setRoleState(ac.role)
      setIsHydratingServer(true)

      getRoadmap(ac.serverRoadmapId, ac.sessionToken)
        .then((loaded) => {
          if (cancelled.value) return
          setIsHydratingServer(false)
          setBackendUnavailableRoadmapId(null)
          setRoadmapNameState(loaded.roadmap.name)
          setPhasesState(loaded.phases)
          setOwnerDisplayNameState(loaded.ownerDisplayName)
          setUpdatedAtState(loaded.updatedAt)
          setIsPasswordEnabledState(!!loaded.roadmap.isPasswordEnabled)
          setSavedState(true)

          storage.setRoadmapCache(targetId, {
            roadmapName: loaded.roadmap.name,
            phases: loaded.phases,
            saved: true,
            ownerDisplayName: loaded.ownerDisplayName,
            updatedAt: loaded.updatedAt,
            isPasswordEnabled: !!loaded.roadmap.isPasswordEnabled,
          })
        })
        .catch((err: unknown) => {
          if (cancelled.value) return
          setIsHydratingServer(false)
          if (isApiConnectionError(err)) {
            setBackendUnavailableRoadmapId(ac.serverRoadmapId)
            console.warn('RoadForge API unavailable; using cached roadmap data.')
            return
          }
          if (isAuthError(err)) {
            storage.setAuthCache(targetId, null)
            setServerRoadmapIdState(null)
            setSessionTokenState(null)
            setParticipantIdState(null)
            setRoleState(null)
            return
          }
          console.error('Failed to hydrate roadmap from server:', err)
        })
    } else {
      setIsHydratingServer(false)
      setServerRoadmapIdState(null)
      setSessionTokenState(null)
      setParticipantIdState(null)
      setRoleState(null)
    }
  }, [])

  // Hydrate once on mount
  useEffect(() => {
    const cancelled = { value: false }

    const storedDisplayName = storage.getDisplayName()
    if (storedDisplayName !== null) setDisplayNameState(storedDisplayName)

    // Migration
    storage.migrateLegacyStorageIfNeeded()

    const urlRoadmapId = getRoadmapIdFromUrl()
    let targetId = urlRoadmapId && storage.getRoadmapCache(urlRoadmapId)
      ? urlRoadmapId
      : storage.getActiveRoadmapId()
    if (!targetId || !storage.getRoadmapCache(targetId)) {
      targetId = storage.getLastRoadmapId()
    }
    if (!targetId || !storage.getRoadmapCache(targetId)) {
      // Default local fallback
      targetId = storage.createLocalDraftId()
      storage.setActiveRoadmapId(targetId)
      storage.setLastRoadmapId(targetId)
      storage.setRoadmapCache(targetId, {
        roadmapName: 'v1.0 Public Launch',
        phases: SAMPLE_ROADMAP.phases,
        saved: false,
        ownerDisplayName: null,
        updatedAt: null,
        isPasswordEnabled: false,
      })
    } else {
      storage.setActiveRoadmapId(targetId)
    }

    setActiveRoadmapIdState(targetId)
    loadRoadmapIntoState(targetId, cancelled)

    return () => { cancelled.value = true }
  }, [loadRoadmapIntoState])

  // ─── Realtime subscription ───────────────────────────────────────────────────

  useEffect(() => {
    if (!serverRoadmapId || !sessionToken) return
    if (typeof document === 'undefined') return
    if (isHydratingServer) return
    if (backendUnavailableRoadmapId === serverRoadmapId) return

    let unsubscribe: (() => void) | null = null
    let hiddenAt: number | null = null

    const startSync = async () => {
      try {
        const activeLocks = await getLocks(serverRoadmapId, sessionToken)
        const lockMap: Record<string, { participantId: string; displayName: string }> = {}
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
            // last_updated_at and receives a 409, surfacing as OFFLINE.
            if (savedRef.current === false) {
              return
            }

            getRoadmap(serverRoadmapId, sessionToken).then((loaded) => {
              setRoadmapNameState(loaded.roadmap.name)
              setPhasesState(loaded.phases)
              setOwnerDisplayNameState(loaded.ownerDisplayName)
              setUpdatedAtState(loaded.updatedAt)
              setIsPasswordEnabledState(!!loaded.roadmap.isPasswordEnabled)

              const activeId = storage.getActiveRoadmapId()
              if (activeId) {
                const rc = storage.getRoadmapCache(activeId)
                if (rc) {
                  storage.setRoadmapCache(activeId, {
                    ...rc,
                    roadmapName: loaded.roadmap.name,
                    phases: loaded.phases,
                    ownerDisplayName: loaded.ownerDisplayName,
                    updatedAt: loaded.updatedAt,
                    isPasswordEnabled: !!loaded.roadmap.isPasswordEnabled,
                  })
                }
              }
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
        })
      } catch (err) {
        if (isApiConnectionError(err)) {
          setBackendUnavailableRoadmapId(serverRoadmapId)
          console.warn('Realtime sync paused; RoadForge API is unavailable.')
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
  }, [serverRoadmapId, sessionToken, participantId, isHydratingServer, backendUnavailableRoadmapId])

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
    setPhasesState(p)
    const id = storage.getActiveRoadmapId()
    if (id) {
      const rc = storage.getRoadmapCache(id)
      if (rc) storage.setRoadmapCache(id, { ...rc, phases: p })
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

  const resetToSample = useCallback(() => {
    const newId = storage.createLocalDraftId()
    storage.setActiveRoadmapId(newId)
    storage.setLastRoadmapId(newId)
    
    const cache: RoadmapCache = {
      roadmapName: 'v1.0 Public Launch',
      phases: SAMPLE_ROADMAP.phases,
      saved: false,
      ownerDisplayName: null,
      updatedAt: null,
      isPasswordEnabled: false,
    }
    storage.setRoadmapCache(newId, cache)
    storage.setAuthCache(newId, null)

    // Note: We intentionally don't wipe other roadmap caches.
    setBackendUnavailableRoadmapId(null)
    setIsHydratingServer(false)
    setRoadmapNameState(cache.roadmapName)
    setPhasesState(cache.phases)
    setSavedState(false)
    setServerRoadmapIdState(null)
    setSessionTokenState(null)
    setParticipantIdState(null)
    setRoleState(null)
    setIsPasswordEnabledState(false)
    setOwnerDisplayNameState(null)
    setUpdatedAtState(null)
    setLocks({})
  }, [])

  const createLocalRoadmap = useCallback((name: string, nextPhases: Phase[]) => {
    const newId = storage.createLocalDraftId()
    const cache: RoadmapCache = {
      roadmapName: name,
      phases: nextPhases,
      saved: false,
      ownerDisplayName: null,
      updatedAt: null,
      isPasswordEnabled: false,
    }

    storage.setActiveRoadmapId(newId)
    storage.setLastRoadmapId(newId)
    storage.setRoadmapCache(newId, cache)
    storage.setAuthCache(newId, null)

    setBackendUnavailableRoadmapId(null)
    setIsHydratingServer(false)
    setLocks({})
    setActiveRoadmapIdState(newId)
    setRoadmapNameState(name)
    setPhasesState(nextPhases)
    setSavedState(false)
    setServerRoadmapIdState(null)
    setSessionTokenState(null)
    setParticipantIdState(null)
    setRoleState(null)
    setIsPasswordEnabledState(false)
    setOwnerDisplayNameState(null)
    setUpdatedAtState(null)

    return newId
  }, [])

  const removeRoadmapFromBrowser = useCallback((id: string) => {
    storage.removeRoadmap(id)
    setBackendUnavailableRoadmapId(null)
    setIsHydratingServer(false)
    setLocks({})

    const next = storage.listRoadmapCaches()[0]
    if (next) {
      storage.setActiveRoadmapId(next.id)
      storage.setLastRoadmapId(next.id)
      setActiveRoadmapIdState(next.id)
      loadRoadmapIntoState(next.id, { value: false })
      return
    }

    const newId = storage.createLocalDraftId()
    const cache: RoadmapCache = {
      roadmapName: 'v1.0 Public Launch',
      phases: SAMPLE_ROADMAP.phases,
      saved: false,
      ownerDisplayName: null,
      updatedAt: null,
      isPasswordEnabled: false,
    }
    storage.setActiveRoadmapId(newId)
    storage.setLastRoadmapId(newId)
    storage.setRoadmapCache(newId, cache)
    storage.setAuthCache(newId, null)

    setActiveRoadmapIdState(newId)
    setRoadmapNameState(cache.roadmapName)
    setPhasesState(cache.phases)
    setSavedState(false)
    setServerRoadmapIdState(null)
    setSessionTokenState(null)
    setParticipantIdState(null)
    setRoleState(null)
    setIsPasswordEnabledState(false)
    setOwnerDisplayNameState(null)
    setUpdatedAtState(null)
  }, [loadRoadmapIntoState])

  const activateRoadmap = useCallback((id: string) => {
    storage.setActiveRoadmapId(id)
    storage.setLastRoadmapId(id)
    setBackendUnavailableRoadmapId(null)
    setActiveRoadmapIdState(id)
    loadRoadmapIntoState(id, { value: false })
  }, [loadRoadmapIntoState])

  return (
    <RoadmapContext.Provider
      value={{ displayName, setDisplayName, roadmapName, setRoadmapName, phases, setPhases, saved, setSaved, serverRoadmapId, setServerRoadmapId, sessionToken, setSessionToken, participantId, setParticipantId, role, setRole, isPasswordEnabled, setIsPasswordEnabled, ownerDisplayName, setOwnerDisplayName, updatedAt, setUpdatedAt, locks, activeRoadmapId, activateRoadmap, createLocalRoadmap, resetToSample, removeRoadmapFromBrowser }}
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
