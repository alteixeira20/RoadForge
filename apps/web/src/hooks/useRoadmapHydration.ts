'use client'

import { useState, useCallback, useRef, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { Phase, ShareRole } from '@/types/roadmap'
import { SAMPLE_ROADMAP } from '@/data/sample-roadmap'
import { storage, type RoadmapCache } from '@/lib/storage'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot, type RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'
import { getRoadmap } from '@/services/roadmap-crud.service'
import { isApiConnectionError } from '@/services/roadmap-http'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoadmapUpgradeState {
  roadmapId: string
}

interface HydrationRoadmapStateSetters {
  setRoadmapNameState: Dispatch<SetStateAction<string>>
  setPhasesState: Dispatch<SetStateAction<Phase[]>>
  setSavedState: Dispatch<SetStateAction<boolean>>
  setActiveRoadmapIdState: Dispatch<SetStateAction<string | null>>
}

interface HydrationSessionStateSetters {
  setServerRoadmapIdState: Dispatch<SetStateAction<string | null>>
  setSessionTokenState: Dispatch<SetStateAction<string | null>>
  setParticipantIdState: Dispatch<SetStateAction<string | null>>
  setRoleState: Dispatch<SetStateAction<ShareRole | null>>
}

interface HydrationMetadataStateSetters {
  setDisplayNameState: Dispatch<SetStateAction<string>>
  setIsPasswordEnabledState: Dispatch<SetStateAction<boolean>>
  setOwnerDisplayNameState: Dispatch<SetStateAction<string | null>>
  setUpdatedAtState: Dispatch<SetStateAction<string | null>>
}

interface HydrationLifecycleStateSetters {
  setLocks: Dispatch<SetStateAction<Record<string, { participantId: string; displayName: string }>>>
  setRoadmapUpgradeNotice: Dispatch<SetStateAction<RoadmapUpgradeState | null>>
}

// Grouped raw state setters passed in from RoadmapContext.
export interface HydrationSetters {
  roadmapState: HydrationRoadmapStateSetters
  sessionState: HydrationSessionStateSetters
  metadataState: HydrationMetadataStateSetters
  lifecycleState: HydrationLifecycleStateSetters
}

export interface UseRoadmapHydrationReturn {
  isHydratingServer: boolean
  backendUnavailableRoadmapId: string | null
  showUpgradeNoticeOnce: (targetId: string, result: { changed: boolean; notices: RoadmapUpgradeNotice[] }) => void
  loadRoadmapIntoState: (targetId: string, cancelled: { value: boolean }) => void
  activateRoadmap: (id: string) => void
  createLocalRoadmap: (name: string, phases: Phase[]) => string
  resetToSample: () => void
  removeRoadmapFromBrowser: (id: string) => void
  setBackendUnavailableRoadmapId: Dispatch<SetStateAction<string | null>>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function buildSampleCache(): RoadmapCache {
  const upgraded = upgradeRoadmapSnapshot({
    roadmapName: 'v1.0 Public Launch',
    phases: SAMPLE_ROADMAP.phases,
  })
  return {
    roadmapName: upgraded.roadmapName || 'v1.0 Public Launch',
    phases: upgraded.phases,
    saved: false,
    ownerDisplayName: null,
    updatedAt: null,
    isPasswordEnabled: false,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRoadmapHydration(setters: HydrationSetters): UseRoadmapHydrationReturn {
  const {
    roadmapState,
    sessionState,
    metadataState,
    lifecycleState,
  } = setters
  const {
    setRoadmapNameState,
    setPhasesState,
    setSavedState,
    setActiveRoadmapIdState,
  } = roadmapState
  const {
    setServerRoadmapIdState,
    setSessionTokenState,
    setParticipantIdState,
    setRoleState,
  } = sessionState
  const {
    setDisplayNameState,
    setIsPasswordEnabledState,
    setOwnerDisplayNameState,
    setUpdatedAtState,
  } = metadataState
  const {
    setLocks,
    setRoadmapUpgradeNotice,
  } = lifecycleState

  const [isHydratingServer, setIsHydratingServer] = useState(false)
  const [backendUnavailableRoadmapId, setBackendUnavailableRoadmapId] = useState<string | null>(null)
  const shownUpgradeNoticeIdsRef = useRef<Set<string>>(new Set())

  const showUpgradeNoticeOnce = useCallback((
    targetId: string,
    result: { changed: boolean; notices: RoadmapUpgradeNotice[] },
  ) => {
    if (!result.changed || result.notices.length === 0) return
    if (shownUpgradeNoticeIdsRef.current.has(targetId)) return
    shownUpgradeNoticeIdsRef.current.add(targetId)
    setRoadmapUpgradeNotice({ roadmapId: targetId })
  }, [setRoadmapUpgradeNotice])

  const resetAllState = useCallback((
    cache: RoadmapCache,
    activeRoadmapId?: string,
  ) => {
    setBackendUnavailableRoadmapId(null)
    setIsHydratingServer(false)
    if (activeRoadmapId) setActiveRoadmapIdState(activeRoadmapId)
    setRoadmapUpgradeNotice(null)
    setRoadmapNameState(cache.roadmapName)
    setPhasesState(cache.phases)
    setSavedState(cache.saved)
    setServerRoadmapIdState(null)
    setSessionTokenState(null)
    setParticipantIdState(null)
    setRoleState(null)
    setIsPasswordEnabledState(cache.isPasswordEnabled)
    setOwnerDisplayNameState(cache.ownerDisplayName)
    setUpdatedAtState(cache.updatedAt)
  }, [
    setActiveRoadmapIdState,
    setRoadmapUpgradeNotice,
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
  ])

  const loadRoadmapIntoState = useCallback((targetId: string, cancelled: { value: boolean }) => {
    const rc = storage.getRoadmapCache(targetId)
    const ac = storage.getAuthCache(targetId)
    setBackendUnavailableRoadmapId(null)
    setRoadmapUpgradeNotice((current) => (
      current && current.roadmapId !== targetId ? null : current
    ))

    if (rc) {
      let cacheToLoad = rc
      try {
        const upgraded = upgradeRoadmapSnapshot({
          roadmapName: rc.roadmapName,
          phases: rc.phases,
        })
        if (upgraded.changed) {
          const canPersistCachedUpgrade = ac?.role === 'owner' || ac?.role === 'editor'
          cacheToLoad = {
            ...rc,
            roadmapName: upgraded.roadmapName || rc.roadmapName,
            phases: upgraded.phases,
            saved: canPersistCachedUpgrade ? false : rc.saved,
          }
          storage.setRoadmapCache(targetId, cacheToLoad)
          showUpgradeNoticeOnce(targetId, upgraded)
        }
      } catch (err) {
        console.warn('Could not upgrade cached roadmap snapshot:', err)
      }

      setRoadmapNameState(cacheToLoad.roadmapName)
      setPhasesState(normalizePhasesProgress(cacheToLoad.phases))
      setSavedState(cacheToLoad.saved)
      setOwnerDisplayNameState(cacheToLoad.ownerDisplayName)
      setUpdatedAtState(cacheToLoad.updatedAt)
      setIsPasswordEnabledState(cacheToLoad.isPasswordEnabled)
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
          let nextRoadmapName = loaded.roadmap.name
          let normalizedLoadedPhases = normalizePhasesProgress(loaded.phases)
          let nextSaved = true
          try {
            const upgraded = upgradeRoadmapSnapshot({
              roadmapName: loaded.roadmap.name,
              phases: loaded.phases,
            })
            nextRoadmapName = upgraded.roadmapName || loaded.roadmap.name
            normalizedLoadedPhases = normalizePhasesProgress(upgraded.phases)
            const canPersistUpgrade = ac.role === 'owner' || ac.role === 'editor'
            nextSaved = !(upgraded.changed && canPersistUpgrade)
            showUpgradeNoticeOnce(targetId, upgraded)
          } catch (err) {
            console.warn('Could not upgrade server roadmap snapshot:', err)
          }
          setRoadmapNameState(nextRoadmapName)
          setPhasesState(normalizedLoadedPhases)
          setOwnerDisplayNameState(loaded.ownerDisplayName)
          setUpdatedAtState(loaded.updatedAt)
          setIsPasswordEnabledState(!!loaded.roadmap.isPasswordEnabled)
          setSavedState(nextSaved)

          storage.setRoadmapCache(targetId, {
            roadmapName: nextRoadmapName,
            phases: normalizedLoadedPhases,
            saved: nextSaved,
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
  }, [
    showUpgradeNoticeOnce,
    setRoadmapUpgradeNotice,
    setRoadmapNameState,
    setPhasesState,
    setSavedState,
    setOwnerDisplayNameState,
    setUpdatedAtState,
    setIsPasswordEnabledState,
    setServerRoadmapIdState,
    setSessionTokenState,
    setParticipantIdState,
    setRoleState,
  ])

  // Mount-time hydration effect
  useEffect(() => {
    const cancelled = { value: false }

    const storedDisplayName = storage.getDisplayName()
    if (storedDisplayName !== null) setDisplayNameState(storedDisplayName)

    // Migration: move legacy flat keys to scoped per-roadmap keys
    storage.migrateLegacyStorageIfNeeded()

    const urlRoadmapId = getRoadmapIdFromUrl()
    let targetId = urlRoadmapId && storage.getRoadmapCache(urlRoadmapId)
      ? urlRoadmapId
      : storage.getActiveRoadmapId()
    if (!targetId || !storage.getRoadmapCache(targetId)) {
      targetId = storage.getLastRoadmapId()
    }
    if (!targetId || !storage.getRoadmapCache(targetId)) {
      // No known roadmap — seed sample
      targetId = storage.createLocalDraftId()
      const cache = buildSampleCache()
      storage.setActiveRoadmapId(targetId)
      storage.setLastRoadmapId(targetId)
      storage.setRoadmapCache(targetId, cache)
    } else {
      storage.setActiveRoadmapId(targetId)
    }

    setActiveRoadmapIdState(targetId)
    loadRoadmapIntoState(targetId, cancelled)

    return () => { cancelled.value = true }
  }, [loadRoadmapIntoState, setDisplayNameState, setActiveRoadmapIdState])

  const activateRoadmap = useCallback((id: string) => {
    storage.setActiveRoadmapId(id)
    storage.setLastRoadmapId(id)
    setBackendUnavailableRoadmapId(null)
    setActiveRoadmapIdState(id)
    loadRoadmapIntoState(id, { value: false })
  }, [loadRoadmapIntoState, setActiveRoadmapIdState])

  const createLocalRoadmap = useCallback((name: string, nextPhases: Phase[]) => {
    const newId = storage.createLocalDraftId()
    const upgraded = upgradeRoadmapSnapshot({ roadmapName: name, phases: nextPhases })
    const normalizedPhases = normalizePhasesProgress(upgraded.phases)
    const nextName = upgraded.roadmapName || name
    const cache: RoadmapCache = {
      roadmapName: nextName,
      phases: normalizedPhases,
      saved: false,
      ownerDisplayName: null,
      updatedAt: null,
      isPasswordEnabled: false,
    }

    storage.setActiveRoadmapId(newId)
    storage.setLastRoadmapId(newId)
    storage.setRoadmapCache(newId, cache)
    storage.setAuthCache(newId, null)

    setLocks({})
    resetAllState(cache, newId)

    return newId
  }, [
    resetAllState,
    setLocks,
  ])

  const resetToSample = useCallback(() => {
    const newId = storage.createLocalDraftId()
    const cache = buildSampleCache()
    storage.setActiveRoadmapId(newId)
    storage.setLastRoadmapId(newId)
    storage.setRoadmapCache(newId, cache)
    storage.setAuthCache(newId, null)
    // Note: We intentionally don't wipe other roadmap caches.
    resetAllState(cache)
    setLocks({})
  }, [
    resetAllState,
    setLocks,
  ])

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
    const cache = buildSampleCache()
    storage.setActiveRoadmapId(newId)
    storage.setLastRoadmapId(newId)
    storage.setRoadmapCache(newId, cache)
    storage.setAuthCache(newId, null)

    resetAllState(cache, newId)
  }, [
    loadRoadmapIntoState,
    resetAllState,
    setLocks,
    setActiveRoadmapIdState,
  ])

  return {
    isHydratingServer,
    backendUnavailableRoadmapId,
    showUpgradeNoticeOnce,
    loadRoadmapIntoState,
    activateRoadmap,
    createLocalRoadmap,
    resetToSample,
    removeRoadmapFromBrowser,
    setBackendUnavailableRoadmapId,
  }
}
