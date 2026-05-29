import { useEffect, useRef, useState } from 'react'
import { storage } from '@/lib/storage'
import type { Phase } from '@/types/roadmap'

type PhaseCollapseDefault = Pick<Phase, 'id' | 'status'>
type PhaseCollapseDefaultTuple = [id: string, status: Phase['status']]

function getDefaultOpenPhaseIds(phases: PhaseCollapseDefault[]) {
  const activePhaseIds = phases.filter((phase) => phase.status === 'active').map((phase) => phase.id)
  if (activePhaseIds.length > 0) return activePhaseIds

  const nextPhaseIds = phases.filter((phase) => phase.status === 'next').map((phase) => phase.id)
  if (nextPhaseIds.length > 0) return nextPhaseIds

  return phases[0] ? [phases[0].id] : []
}

function loadOpenPhaseIds(roadmapId: string, phases: PhaseCollapseDefault[]): string[] | null {
  const uiState = storage.getRoadmapUiState(roadmapId)
  if (!uiState || uiState.openPhaseIds.length === 0) return null
  const phaseIds = new Set(phases.map((p) => p.id))
  const valid = uiState.openPhaseIds.filter((id) => phaseIds.has(id))
  return valid.length > 0 ? valid : null
}

export function usePhaseCollapse(phases: Phase[], roadmapId: string | null) {
  const [openPhases, setOpenPhases] = useState<string[]>(() => {
    if (roadmapId) {
      const saved = loadOpenPhaseIds(roadmapId, phases)
      if (saved) return saved
    }
    return getDefaultOpenPhaseIds(phases)
  })

  const phaseIdsKey = JSON.stringify(phases.map((phase) => phase.id))
  const phaseDefaultsKey = JSON.stringify(
    phases.map(({ id, status }) => [id, status] as PhaseCollapseDefaultTuple),
  )

  // Track previous values to detect what changed each effect run
  const previousPhaseIdsKeyRef = useRef(phaseIdsKey)
  const previousRoadmapIdRef = useRef(roadmapId)
  // Tracks which roadmap the current openPhases state belongs to.
  // Prevents writing previous-roadmap state into the new roadmap's UI cache
  // during the render where roadmapId changes but openPhases hasn't updated yet.
  const stateOwnerRef = useRef(roadmapId)

  // Single combined effect handles both roadmap switches and phase list changes.
  // Merging them ensures that when roadmapId and phases update in the same render
  // (the common case — React 18 batches setState calls in the same callback),
  // we reinitialize with the correct phase list rather than with stale phases.
  useEffect(() => {
    const phaseIdsChanged = previousPhaseIdsKeyRef.current !== phaseIdsKey
    const roadmapIdChanged = previousRoadmapIdRef.current !== roadmapId
    previousPhaseIdsKeyRef.current = phaseIdsKey
    previousRoadmapIdRef.current = roadmapId

    const phaseDefaults = (JSON.parse(phaseDefaultsKey) as PhaseCollapseDefaultTuple[])
      .map(([id, status]) => ({ id, status }))

    if (roadmapIdChanged) {
      // Roadmap switched — reinitialize from storage using current phases
      const saved = roadmapId ? loadOpenPhaseIds(roadmapId, phaseDefaults) : null
      setOpenPhases(saved ?? getDefaultOpenPhaseIds(phaseDefaults))
      return
    }

    // Same roadmap — validate open phases against the updated phase list
    setOpenPhases((prev) => {
      const phaseIds = new Set(phaseDefaults.map((phase) => phase.id))
      const validOpenPhases = prev.filter((id) => phaseIds.has(id))

      if (validOpenPhases.length > 0) {
        return validOpenPhases.length === prev.length ? prev : validOpenPhases
      }
      if (prev.length > 0) return validOpenPhases
      if (!phaseIdsChanged) return prev
      return getDefaultOpenPhaseIds(phaseDefaults)
    })
  }, [phaseDefaultsKey, phaseIdsKey, roadmapId])

  // Persist openPhases to UI state.
  // Guard: if openPhases still belongs to the previous roadmap (stateOwnerRef lags behind),
  // skip this write and advance the owner ref. The persist will fire again once
  // setOpenPhases delivers the new roadmap's state.
  useEffect(() => {
    if (!roadmapId) return
    if (stateOwnerRef.current !== roadmapId) {
      stateOwnerRef.current = roadmapId
      return
    }
    const current = storage.getRoadmapUiState(roadmapId) ?? {
      schemaVersion: 1 as const,
      openPhaseIds: [],
      expandedTaskId: null,
      updatedAt: new Date().toISOString(),
    }
    storage.setRoadmapUiState(roadmapId, {
      ...current,
      openPhaseIds: openPhases,
      updatedAt: new Date().toISOString(),
    })
  }, [openPhases, roadmapId])

  const togglePhase = (id: string) =>
    setOpenPhases((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const allOpen = openPhases.length === phases.length
  const collapseAll = () => setOpenPhases([])
  const expandAll = () => setOpenPhases(phases.map((p) => p.id))

  return { openPhases, togglePhase, allOpen, collapseAll, expandAll }
}
