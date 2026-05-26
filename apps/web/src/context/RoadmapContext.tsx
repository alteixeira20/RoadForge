'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import type { Phase, ShareRole } from '@/types/roadmap'
import { SAMPLE_ROADMAP } from '@/data/sample-roadmap'
import { storage } from '@/lib/storage'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import {
  getRoadmap,
  getEventTicket,
  subscribeToRoadmapEvents,
  getLocks,
  isApiConnectionError,
} from '@/services/roadmap.service'
import { useRoadmapHydration, type RoadmapUpgradeState } from '@/hooks/useRoadmapHydration'

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
  accessRevokedEvent: 'revoked' | 'deleted' | null
  clearAccessRevokedEvent: () => void
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
  const [locks, setLocks] = useState<Record<string, { participantId: string; displayName: string }>>({})
  const [activeRoadmapId, setActiveRoadmapIdState] = useState<string | null>(null)
  const [accessRevokedEvent, setAccessRevokedEvent] = useState<'revoked' | 'deleted' | null>(null)
  const [roadmapUpgradeNotice, setRoadmapUpgradeNotice] = useState<RoadmapUpgradeState | null>(null)

  // Keep ref current so SSE callbacks always read the latest value
  savedRef.current = saved

  const {
    isHydratingServer,
    backendUnavailableRoadmapId,
    showUpgradeNoticeOnce,
    activateRoadmap,
    createLocalRoadmap,
    resetToSample,
    removeRoadmapFromBrowser,
    setBackendUnavailableRoadmapId,
  } = useRoadmapHydration({
    setDisplayNameState,
    setRoadmapNameState,
    setPhasesState,
    setSavedState,
    setServerRoadmapIdState,
    setSessionTokenState,
    setParticipantIdState,
    setRoleState,
    setIsPasswordEnabledState,
    setOwnerDisplayNameState,
    setUpdatedAtState,
    setActiveRoadmapIdState,
    setLocks,
    setRoadmapUpgradeNotice,
  })

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
            // Close EventSource immediately — auth is no longer valid.
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
            setAccessRevokedEvent('revoked')
          },
          onRoadmapDeleted: (payload) => {
            if (payload.roadmap_id !== serverRoadmapId) return
            // Close EventSource — the roadmap no longer exists on the server.
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
            setAccessRevokedEvent('deleted')
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
  }, [serverRoadmapId, sessionToken, participantId, role, activeRoadmapId, isHydratingServer, backendUnavailableRoadmapId, showUpgradeNoticeOnce, setBackendUnavailableRoadmapId])

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

  const clearAccessRevokedEvent = useCallback(() => {
    setAccessRevokedEvent(null)
  }, [])

  const dismissRoadmapUpgradeNotice = useCallback(() => {
    setRoadmapUpgradeNotice(null)
  }, [])

  return (
    <RoadmapContext.Provider
      value={{ displayName, setDisplayName, roadmapName, setRoadmapName, phases, setPhases, saved, setSaved, serverRoadmapId, setServerRoadmapId, sessionToken, setSessionToken, participantId, setParticipantId, role, setRole, isPasswordEnabled, setIsPasswordEnabled, ownerDisplayName, setOwnerDisplayName, updatedAt, setUpdatedAt, locks, activeRoadmapId, activateRoadmap, createLocalRoadmap, resetToSample, removeRoadmapFromBrowser, accessRevokedEvent, clearAccessRevokedEvent, roadmapUpgradeNotice, dismissRoadmapUpgradeNotice }}
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
