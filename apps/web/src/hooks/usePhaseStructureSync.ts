'use client'

import { useCallback, useRef } from 'react'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
import {
  orderPhasesByPreference,
  reconcileCreatedPhaseAcknowledgement,
  removePhaseAndDanglingDependencies,
} from '@/lib/phase-structure-merge'
import {
  isNewerServerRevision,
  isOlderServerRevision,
  newestServerRevision,
} from '@/lib/server-revision'
import { storage } from '@/lib/storage'
import {
  createServerPhase,
  deleteServerPhase,
  reorderServerPhases,
} from '@/services/roadmap-structure.service'
import type { Phase } from '@/types/roadmap'

export type PhaseServerReadiness = 'ready' | 'absent' | 'uncertain'

interface UsePhaseStructureSyncParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  serverRoadmapId: string | null
  sessionToken: string | null
  updatedAt: string | null
  setUpdatedAt: (updatedAt: string) => void
  showToast: (message: string) => void
  onSuccess: () => void
  onSessionExpired: () => void
  beginFocusedWrite: () => void
  endFocusedWrite: () => void
}

interface FocusedStructureOptions {
  onAggregateFallback: () => void
}

interface UsePhaseStructureSyncResult {
  createSyncedPhase: (phase: Phase, options: FocusedStructureOptions) => boolean
  deleteSyncedPhase: (phaseId: string, options: FocusedStructureOptions) => boolean
  reorderSyncedPhases: (phaseIds: string[], options: FocusedStructureOptions) => boolean
  waitForPhaseReady: (phaseId: string) => Promise<PhaseServerReadiness>
}

interface CreationBarrier {
  promise: Promise<PhaseServerReadiness>
  resolve: (readiness: PhaseServerReadiness) => void
}

function cachedServerRevision(): string | null {
  const activeId = storage.getActiveRoadmapId()
  if (!activeId) return null
  return storage.getRoadmapCache(activeId)?.updatedAt ?? null
}

function createBarrier(): CreationBarrier {
  let resolve!: (readiness: PhaseServerReadiness) => void
  const promise = new Promise<PhaseServerReadiness>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

export function usePhaseStructureSync({
  phases,
  setPhases,
  setSaved,
  serverRoadmapId,
  sessionToken,
  updatedAt,
  setUpdatedAt,
  showToast,
  onSuccess,
  onSessionExpired,
  beginFocusedWrite,
  endFocusedWrite,
}: UsePhaseStructureSyncParams): UsePhaseStructureSyncResult {
  const phasesRef = useRef(phases)
  const latestRevisionRef = useRef<string | null>(updatedAt)
  const structureGenerationRef = useRef(0)
  const creationBarriersRef = useRef<Map<string, CreationBarrier>>(new Map())

  phasesRef.current = phases
  if (updatedAt && isNewerServerRevision(updatedAt, latestRevisionRef.current)) {
    latestRevisionRef.current = updatedAt
  }

  const setCurrentPhases = useCallback((nextPhases: Phase[]) => {
    phasesRef.current = nextPhases
    setPhases(nextPhases)
  }, [setPhases])

  const responseIsStale = useCallback((candidate: string): boolean => {
    const current = newestServerRevision(latestRevisionRef.current, cachedServerRevision())
    return isOlderServerRevision(candidate, current)
  }, [])

  const advanceUpdatedAt = useCallback((candidate: string) => {
    const current = newestServerRevision(latestRevisionRef.current, cachedServerRevision())
    if (isOlderServerRevision(candidate, current)) return
    if (!isNewerServerRevision(candidate, latestRevisionRef.current)) return
    latestRevisionRef.current = candidate
    setUpdatedAt(candidate)
  }, [setUpdatedAt])

  const waitForPhaseReady = useCallback((phaseId: string): Promise<PhaseServerReadiness> => (
    creationBarriersRef.current.get(phaseId)?.promise ?? Promise.resolve('ready')
  ), [])

  const handleAmbiguousFailure = useCallback((
    message: string,
    onAggregateFallback: () => void,
  ) => {
    setSaved(false)
    onAggregateFallback()
    showToast(message)
  }, [setSaved, showToast])

  const createSyncedPhase = useCallback((
    phase: Phase,
    { onAggregateFallback }: FocusedStructureOptions,
  ): boolean => {
    if (!serverRoadmapId || !sessionToken) return false

    structureGenerationRef.current += 1
    const generation = structureGenerationRef.current
    const barrier = createBarrier()
    creationBarriersRef.current.set(phase.id, barrier)
    beginFocusedWrite()
    setCurrentPhases([...phasesRef.current, phase])

    void (async () => {
      let readiness: PhaseServerReadiness = 'uncertain'
      try {
        const result = await createServerPhase(serverRoadmapId, phase, sessionToken)
        readiness = 'ready'
        if (!responseIsStale(result.updatedAt)) {
          if (structureGenerationRef.current === generation) {
            const reconciled = reconcileCreatedPhaseAcknowledgement(
              phasesRef.current,
              result.phases,
              phase.id,
            )
            if (reconciled) setCurrentPhases(reconciled)
          }
          advanceUpdatedAt(result.updatedAt)
        }
        onSuccess()
      } catch (error) {
        const { kind } = classifyRoadmapSaveError(error)
        const definitive = kind === 'validation'
          || kind === 'forbidden'
          || kind === 'unauthorized'
          || kind === 'session-expired'
          || kind === 'conflict'
        if (definitive) {
          readiness = 'absent'
          setCurrentPhases(removePhaseAndDanglingDependencies(phasesRef.current, phase.id))
          if (kind === 'session-expired' || kind === 'unauthorized') {
            onSessionExpired()
          } else if (kind === 'forbidden') {
            showToast('You do not have permission to create phases.')
          } else if (kind === 'validation') {
            showToast('The server rejected this phase. The local phase was removed.')
          } else {
            showToast('That phase could not be created because its ID is already in use.')
          }
        } else {
          handleAmbiguousFailure(
            kind === 'connection'
              ? 'Could not confirm the new phase with the server. It remains as a local draft.'
              : 'Could not confirm the new phase. It remains as a local draft.',
            onAggregateFallback,
          )
        }
      } finally {
        barrier.resolve(readiness)
        if (creationBarriersRef.current.get(phase.id) === barrier) {
          creationBarriersRef.current.delete(phase.id)
        }
        endFocusedWrite()
      }
    })()

    return true
  }, [
    advanceUpdatedAt,
    beginFocusedWrite,
    endFocusedWrite,
    handleAmbiguousFailure,
    onSessionExpired,
    onSuccess,
    responseIsStale,
    serverRoadmapId,
    sessionToken,
    setCurrentPhases,
    showToast,
  ])

  const deleteSyncedPhase = useCallback((
    phaseId: string,
    { onAggregateFallback }: FocusedStructureOptions,
  ): boolean => {
    if (!serverRoadmapId || !sessionToken) return false

    const readinessPromise = waitForPhaseReady(phaseId)
    structureGenerationRef.current += 1
    const generation = structureGenerationRef.current
    beginFocusedWrite()
    setCurrentPhases(removePhaseAndDanglingDependencies(phasesRef.current, phaseId))

    void (async () => {
      try {
        const readiness = await readinessPromise
        if (readiness === 'absent') {
          onSuccess()
          return
        }
        if (readiness === 'uncertain') {
          handleAmbiguousFailure(
            'Could not confirm the phase deletion with the server. The deletion remains a local draft.',
            onAggregateFallback,
          )
          return
        }

        const result = await deleteServerPhase(serverRoadmapId, phaseId, sessionToken)
        if (!responseIsStale(result.updatedAt)) {
          if (structureGenerationRef.current === generation) {
            const withoutDeleted = removePhaseAndDanglingDependencies(phasesRef.current, phaseId)
            setCurrentPhases(orderPhasesByPreference(
              withoutDeleted,
              result.phases.map((phase) => phase.id),
            ))
          }
          advanceUpdatedAt(result.updatedAt)
        }
        onSuccess()
      } catch (error) {
        const { kind, status } = classifyRoadmapSaveError(error)
        if (kind === 'session-expired' || kind === 'unauthorized') {
          onSessionExpired()
          return
        }
        if (kind === 'forbidden') {
          showToast('You do not have permission to delete phases.')
          return
        }
        if (kind === 'validation') {
          showToast('The server rejected this phase deletion.')
          return
        }
        if (status === 404) {
          // The desired entity state is already true. Realtime will carry the
          // collaborator revision; do not resurrect a phase solely because
          // another participant won the delete race.
          onSuccess()
          return
        }
        handleAmbiguousFailure(
          kind === 'connection'
            ? 'Could not confirm the phase deletion with the server. It remains a local draft.'
            : 'Could not confirm the phase deletion. It remains a local draft.',
          onAggregateFallback,
        )
      } finally {
        endFocusedWrite()
      }
    })()

    return true
  }, [
    advanceUpdatedAt,
    beginFocusedWrite,
    deleteServerPhase,
    endFocusedWrite,
    handleAmbiguousFailure,
    onSessionExpired,
    onSuccess,
    responseIsStale,
    serverRoadmapId,
    sessionToken,
    setCurrentPhases,
    showToast,
    waitForPhaseReady,
  ])

  const reorderSyncedPhases = useCallback((
    phaseIds: string[],
    { onAggregateFallback }: FocusedStructureOptions,
  ): boolean => {
    if (!serverRoadmapId || !sessionToken) return false

    const readinessPromises = phaseIds.map((phaseId) => waitForPhaseReady(phaseId))
    structureGenerationRef.current += 1
    const generation = structureGenerationRef.current
    beginFocusedWrite()
    setCurrentPhases(orderPhasesByPreference(phasesRef.current, phaseIds))

    void (async () => {
      try {
        const readiness = await Promise.all(readinessPromises)
        if (readiness.includes('uncertain')) {
          handleAmbiguousFailure(
            'Could not confirm the phase order with the server. The order remains a local draft.',
            onAggregateFallback,
          )
          return
        }
        const readyIds = phaseIds.filter((_, index) => readiness[index] !== 'absent')
        if (readyIds.length === 0) {
          onSuccess()
          return
        }

        const result = await reorderServerPhases(serverRoadmapId, readyIds, sessionToken)
        if (!responseIsStale(result.updatedAt)) {
          if (structureGenerationRef.current === generation) {
            setCurrentPhases(orderPhasesByPreference(
              phasesRef.current,
              result.phases.map((phase) => phase.id),
            ))
          }
          advanceUpdatedAt(result.updatedAt)
        }
        onSuccess()
      } catch (error) {
        const { kind } = classifyRoadmapSaveError(error)
        if (kind === 'session-expired' || kind === 'unauthorized') {
          onSessionExpired()
          return
        }
        if (kind === 'forbidden') {
          showToast('You do not have permission to reorder phases.')
          return
        }
        if (kind === 'validation') {
          showToast('The server rejected this phase order.')
          return
        }
        handleAmbiguousFailure(
          kind === 'connection'
            ? 'Could not confirm the phase order with the server. It remains a local draft.'
            : 'Could not confirm the phase order. It remains a local draft.',
          onAggregateFallback,
        )
      } finally {
        endFocusedWrite()
      }
    })()

    return true
  }, [
    advanceUpdatedAt,
    beginFocusedWrite,
    endFocusedWrite,
    handleAmbiguousFailure,
    onSessionExpired,
    onSuccess,
    responseIsStale,
    serverRoadmapId,
    sessionToken,
    setCurrentPhases,
    showToast,
    waitForPhaseReady,
  ])

  return {
    createSyncedPhase,
    deleteSyncedPhase,
    reorderSyncedPhases,
    waitForPhaseReady,
  }
}
