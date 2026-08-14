'use client'

import { useCallback, useRef } from 'react'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
import {
  isNewerServerRevision,
  isOlderServerRevision,
  newestServerRevision,
} from '@/lib/server-revision'
import { storage } from '@/lib/storage'
import {
  mergeReturnedPhaseFields,
  type PhasePatchField,
} from './partialWriteHelpers'
import {
  patchPhaseFields,
  type PatchPhaseFields,
} from '@/services/roadmap-structure.service'
import type { Phase } from '@/types/roadmap'
import type { PhaseServerReadiness } from './usePhaseStructureSync'

interface UsePhasePatchParams {
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
  waitForPhaseReady: (phaseId: string) => Promise<PhaseServerReadiness>
}

interface PatchSyncedPhaseParams {
  phaseId: string
  updates: PatchPhaseFields
  onAggregateFallback: () => void
}

interface UsePhasePatchResult {
  patchSyncedPhase: (params: PatchSyncedPhaseParams) => boolean
}

const PHASE_PATCH_FIELDS: PhasePatchField[] = ['name', 'color', 'colorMode']

function changedPhaseFields(
  phase: Phase,
  updates: PatchPhaseFields,
): PhasePatchField[] {
  return PHASE_PATCH_FIELDS.filter((field) => (
    field in updates && phase[field] !== updates[field]
  ))
}

function applyLocalPhaseFields(
  phases: Phase[],
  phaseId: string,
  updates: PatchPhaseFields,
  fields: PhasePatchField[],
): Phase[] {
  return phases.map((phase) => {
    if (phase.id !== phaseId) return phase
    const nextPhase = { ...phase }
    for (const field of fields) {
      Object.assign(nextPhase, { [field]: updates[field] })
    }
    return nextPhase
  })
}

function cachedServerRevision(): string | null {
  const activeId = storage.getActiveRoadmapId()
  if (!activeId) return null
  return storage.getRoadmapCache(activeId)?.updatedAt ?? null
}

export function usePhasePatch({
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
  waitForPhaseReady,
}: UsePhasePatchParams): UsePhasePatchResult {
  const phasesRef = useRef(phases)
  const latestRevisionRef = useRef<string | null>(updatedAt)
  const queuesRef = useRef<Map<string, Promise<void>>>(new Map())
  const fieldGenerationsRef = useRef<Map<string, number>>(new Map())

  phasesRef.current = phases
  if (updatedAt && isNewerServerRevision(updatedAt, latestRevisionRef.current)) {
    latestRevisionRef.current = updatedAt
  }

  const advanceUpdatedAt = useCallback((candidate: string) => {
    const current = newestServerRevision(
      latestRevisionRef.current,
      cachedServerRevision(),
    )
    if (isOlderServerRevision(candidate, current)) return
    if (!isNewerServerRevision(candidate, latestRevisionRef.current)) return
    latestRevisionRef.current = candidate
    setUpdatedAt(candidate)
  }, [setUpdatedAt])

  const enqueue = useCallback((key: string, work: () => Promise<void>) => {
    const previous = queuesRef.current.get(key) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(work)
      .finally(() => {
        if (queuesRef.current.get(key) === next) queuesRef.current.delete(key)
      })
    queuesRef.current.set(key, next)
  }, [])

  const patchSyncedPhase = useCallback(({
    phaseId,
    updates,
    onAggregateFallback,
  }: PatchSyncedPhaseParams): boolean => {
    if (!serverRoadmapId || !sessionToken) return false
    const phase = phasesRef.current.find((candidate) => candidate.id === phaseId)
    if (!phase) return false
    const fields = changedPhaseFields(phase, updates)
    if (fields.length === 0) return true

    const previousValues: PatchPhaseFields = {}
    const generations = new Map<PhasePatchField, number>()
    for (const field of fields) {
      Object.assign(previousValues, { [field]: phase[field] })
      const key = `${phaseId}:${field}`
      const generation = (fieldGenerationsRef.current.get(key) ?? 0) + 1
      fieldGenerationsRef.current.set(key, generation)
      generations.set(field, generation)
    }

    beginFocusedWrite()
    const optimistic = applyLocalPhaseFields(phasesRef.current, phaseId, updates, fields)
    phasesRef.current = optimistic
    setPhases(optimistic)

    enqueue(`phase:${phaseId}`, async () => {
      try {
        const readiness = await waitForPhaseReady(phaseId)
        if (readiness === 'absent') return
        if (readiness === 'uncertain') {
          if (phasesRef.current.some((candidate) => candidate.id === phaseId)) {
            setSaved(false)
            onAggregateFallback()
          }
          return
        }

        const result = await patchPhaseFields(
          serverRoadmapId,
          phaseId,
          updates,
          sessionToken,
        )
        const currentRevision = newestServerRevision(
          latestRevisionRef.current,
          cachedServerRevision(),
        )
        const responseIsStale = isOlderServerRevision(result.updatedAt, currentRevision)
        const fieldsStillOwnedByThisWrite = responseIsStale
          ? []
          : fields.filter((field) => (
              fieldGenerationsRef.current.get(`${phaseId}:${field}`) === generations.get(field)
            ))
        if (fieldsStillOwnedByThisWrite.length > 0) {
          const merged = mergeReturnedPhaseFields(
            phasesRef.current,
            result.phases,
            phaseId,
            fieldsStillOwnedByThisWrite,
          )
          phasesRef.current = merged
          setPhases(merged)
        }
        advanceUpdatedAt(result.updatedAt)
        onSuccess()
      } catch (error) {
        const { kind } = classifyRoadmapSaveError(error)
        if (
          kind === 'validation'
          || kind === 'forbidden'
          || kind === 'unauthorized'
          || kind === 'session-expired'
        ) {
          const currentPhase = phasesRef.current.find((candidate) => candidate.id === phaseId)
          const rollbackFields = fields.filter((field) => (
            currentPhase?.[field] === updates[field]
            && fieldGenerationsRef.current.get(`${phaseId}:${field}`) === generations.get(field)
          ))
          if (rollbackFields.length > 0) {
            const rolledBack = applyLocalPhaseFields(
              phasesRef.current,
              phaseId,
              previousValues,
              rollbackFields,
            )
            phasesRef.current = rolledBack
            setPhases(rolledBack)
          }
          if (kind === 'session-expired' || kind === 'unauthorized') {
            onSessionExpired()
          } else if (kind === 'forbidden') {
            showToast('You do not have permission to update this phase.')
          } else {
            showToast('The server rejected this phase update.')
          }
          return
        }

        // A connection/server failure is ambiguous: the focused write may
        // already have committed. Preserve the optimistic field as a local
        // draft and let aggregate recovery use its normal revision guard.
        setSaved(false)
        onAggregateFallback()
        showToast(
          kind === 'connection'
            ? 'Could not confirm the phase update with the server. It remains a local draft.'
            : 'Could not confirm the phase update. It remains a local draft.',
        )
      } finally {
        endFocusedWrite()
      }
    })
    return true
  }, [
    advanceUpdatedAt,
    beginFocusedWrite,
    endFocusedWrite,
    enqueue,
    onSessionExpired,
    onSuccess,
    serverRoadmapId,
    sessionToken,
    setPhases,
    setSaved,
    showToast,
    waitForPhaseReady,
  ])

  return { patchSyncedPhase }
}
