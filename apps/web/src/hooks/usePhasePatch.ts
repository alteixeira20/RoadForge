'use client'

import { useCallback, useRef, useState } from 'react'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
import {
  mergeReturnedPhaseFields,
  type PhasePatchField,
} from './partialWriteHelpers'
import {
  patchPhaseFields,
  type PatchPhaseFields,
} from '@/services/roadmap-structure.service'
import type { Phase } from '@/types/roadmap'

interface UsePhasePatchParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  serverRoadmapId: string | null
  sessionToken: string | null
  updatedAt: string | null
  setUpdatedAt: (updatedAt: string) => void
}

interface PatchSyncedPhaseParams {
  phaseId: string
  updates: PatchPhaseFields
}

interface UsePhasePatchResult {
  phasePatchInFlight: boolean
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

function isNewerRevision(candidate: string, current: string | null): boolean {
  if (!current) return true
  const candidateTime = Date.parse(candidate)
  const currentTime = Date.parse(current)
  if (Number.isFinite(candidateTime) && Number.isFinite(currentTime)) {
    return candidateTime > currentTime
  }
  return candidate > current
}

export function usePhasePatch({
  phases,
  setPhases,
  setSaved,
  serverRoadmapId,
  sessionToken,
  updatedAt,
  setUpdatedAt,
}: UsePhasePatchParams): UsePhasePatchResult {
  const [phasePatchInFlight, setPhasePatchInFlight] = useState(false)
  const phasesRef = useRef(phases)
  const latestRevisionRef = useRef<string | null>(updatedAt)
  const queuesRef = useRef<Map<string, Promise<void>>>(new Map())
  const pendingCountRef = useRef(0)

  phasesRef.current = phases
  if (updatedAt && isNewerRevision(updatedAt, latestRevisionRef.current)) {
    latestRevisionRef.current = updatedAt
  }

  const advanceUpdatedAt = useCallback((candidate: string) => {
    if (!isNewerRevision(candidate, latestRevisionRef.current)) return
    latestRevisionRef.current = candidate
    setUpdatedAt(candidate)
  }, [setUpdatedAt])

  const enqueue = useCallback((key: string, work: () => Promise<void>) => {
    pendingCountRef.current += 1
    setPhasePatchInFlight(true)
    const previous = queuesRef.current.get(key) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(work)
      .finally(() => {
        if (queuesRef.current.get(key) === next) queuesRef.current.delete(key)
        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1)
        setPhasePatchInFlight(pendingCountRef.current > 0)
      })
    queuesRef.current.set(key, next)
  }, [])

  const patchSyncedPhase = useCallback(({
    phaseId,
    updates,
  }: PatchSyncedPhaseParams): boolean => {
    if (!serverRoadmapId || !sessionToken) return false
    const phase = phasesRef.current.find((candidate) => candidate.id === phaseId)
    if (!phase) return false
    const fields = changedPhaseFields(phase, updates)
    if (fields.length === 0) return true

    const previousValues: PatchPhaseFields = {}
    for (const field of fields) {
      Object.assign(previousValues, { [field]: phase[field] })
    }

    const optimistic = applyLocalPhaseFields(phasesRef.current, phaseId, updates, fields)
    phasesRef.current = optimistic
    setPhases(optimistic)

    enqueue(`phase:${phaseId}`, async () => {
      try {
        const result = await patchPhaseFields(
          serverRoadmapId,
          phaseId,
          updates,
          sessionToken,
        )
        const currentPhase = phasesRef.current.find((candidate) => candidate.id === phaseId)
        const fieldsStillOwnedByThisWrite = fields.filter((field) => (
          currentPhase?.[field] === updates[field]
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
          return
        }

        // Connection/server failures are ambiguous: keep the optimistic field
        // as a local draft instead of undoing a write that may have committed.
        // Aggregate recovery remains enabled until the offline-operation queue
        // replaces this fallback in a later collaboration slice.
        setSaved(false)
      }
    })
    return true
  }, [
    advanceUpdatedAt,
    enqueue,
    serverRoadmapId,
    sessionToken,
    setPhases,
    setSaved,
  ])

  return { phasePatchInFlight, patchSyncedPhase }
}
