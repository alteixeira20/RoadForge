'use client'

import { useCallback, useRef, useState } from 'react'
import { classifyRoadmapSaveError } from '@/lib/roadmap-sync-errors'
import {
  mergeReturnedPhaseFields,
  type PhasePatchField,
} from './partialWriteHelpers'
import {
  patchPhaseFields,
  patchRoadmapName,
  type PatchPhaseFields,
} from '@/services/roadmap-structure.service'
import type { Phase } from '@/types/roadmap'

interface UseStructurePatchParams {
  roadmapName: string
  setRoadmapName: (name: string) => void
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  serverRoadmapId: string | null
  sessionToken: string | null
  setUpdatedAt: (updatedAt: string) => void
  showToast: (message: string) => void
  onSuccess: () => void
  onSessionExpired: () => void
}

interface PatchSyncedPhaseParams {
  phaseId: string
  updates: PatchPhaseFields
}

interface UseStructurePatchResult {
  structurePatchInFlight: boolean
  patchSyncedRoadmapName: (name: string) => boolean
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

export function useStructurePatch({
  roadmapName,
  setRoadmapName,
  phases,
  setPhases,
  setSaved,
  serverRoadmapId,
  sessionToken,
  setUpdatedAt,
  showToast,
  onSuccess,
  onSessionExpired,
}: UseStructurePatchParams): UseStructurePatchResult {
  const [structurePatchInFlight, setStructurePatchInFlight] = useState(false)
  const roadmapNameRef = useRef(roadmapName)
  const phasesRef = useRef(phases)
  const queuesRef = useRef<Map<string, Promise<void>>>(new Map())
  const pendingCountRef = useRef(0)

  roadmapNameRef.current = roadmapName
  phasesRef.current = phases

  const enqueue = useCallback((key: string, work: () => Promise<void>) => {
    pendingCountRef.current += 1
    setStructurePatchInFlight(true)
    const previous = queuesRef.current.get(key) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(work)
      .finally(() => {
        if (queuesRef.current.get(key) === next) queuesRef.current.delete(key)
        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1)
        setStructurePatchInFlight(pendingCountRef.current > 0)
      })
    queuesRef.current.set(key, next)
  }, [])

  const handleFailure = useCallback((
    error: unknown,
    rollback: () => void,
    subject: 'roadmap name' | 'phase',
  ) => {
    const { kind, validationMessage } = classifyRoadmapSaveError(error)
    if (kind === 'session-expired' || kind === 'unauthorized') {
      rollback()
      onSessionExpired()
      return
    }
    if (kind === 'forbidden') {
      rollback()
      showToast(`You do not have permission to update this ${subject}.`)
      return
    }
    if (kind === 'validation') {
      rollback()
      showToast(validationMessage ?? `The server rejected this ${subject} update.`)
      return
    }

    // A connection/server failure can be ambiguous: the operation may have
    // committed even if the response was lost. Keep the optimistic value as a
    // local draft and let reconnect/server reconciliation determine truth
    // rather than blindly undoing a possibly successful server write.
    setSaved(false)
    showToast(
      kind === 'connection'
        ? `Connection lost. Kept the ${subject} change locally while RoadForge reconnects.`
        : `Could not confirm the ${subject} update. Kept it locally for recovery.`,
    )
  }, [onSessionExpired, setSaved, showToast])

  const patchSyncedRoadmapName = useCallback((name: string): boolean => {
    if (!serverRoadmapId || !sessionToken) return false
    const previousName = roadmapNameRef.current
    if (previousName === name) return true

    roadmapNameRef.current = name
    setRoadmapName(name)

    enqueue('roadmap:name', async () => {
      try {
        const result = await patchRoadmapName(serverRoadmapId, name, sessionToken)
        // Do not let an earlier queued response overwrite a newer optimistic
        // rename that is still waiting behind it.
        if (roadmapNameRef.current === name) {
          roadmapNameRef.current = result.roadmapName
          setRoadmapName(result.roadmapName)
        }
        setUpdatedAt(result.updatedAt)
        onSuccess()
      } catch (error) {
        handleFailure(error, () => {
          if (roadmapNameRef.current !== name) return
          roadmapNameRef.current = previousName
          setRoadmapName(previousName)
        }, 'roadmap name')
      }
    })
    return true
  }, [
    enqueue,
    handleFailure,
    onSuccess,
    serverRoadmapId,
    sessionToken,
    setRoadmapName,
    setUpdatedAt,
  ])

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
        setUpdatedAt(result.updatedAt)
        onSuccess()
      } catch (error) {
        handleFailure(error, () => {
          const currentPhase = phasesRef.current.find((candidate) => candidate.id === phaseId)
          const rollbackFields = fields.filter((field) => (
            currentPhase?.[field] === updates[field]
          ))
          if (rollbackFields.length === 0) return
          const rolledBack = applyLocalPhaseFields(
            phasesRef.current,
            phaseId,
            previousValues,
            rollbackFields,
          )
          phasesRef.current = rolledBack
          setPhases(rolledBack)
        }, 'phase')
      }
    })
    return true
  }, [
    enqueue,
    handleFailure,
    onSuccess,
    serverRoadmapId,
    sessionToken,
    setPhases,
    setUpdatedAt,
  ])

  return {
    structurePatchInFlight,
    patchSyncedRoadmapName,
    patchSyncedPhase,
  }
}
