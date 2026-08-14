import { useCallback } from 'react'
import { createPhase } from '@/lib/roadmap-factory'
import {
  orderPhasesByPreference,
  removePhaseAndDanglingDependencies,
} from '@/lib/phase-structure-merge'
import { useRoadmapData, useRoadmapSession } from '@/context/RoadmapContext'
import { usePhasePatch } from '@/hooks/usePhasePatch'
import { usePhaseStructureSync } from '@/hooks/usePhaseStructureSync'
import type { ActivityChange, Phase, PhaseColorMode } from '@/types/roadmap'

interface UsePhaseMutationsParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  readOnly: boolean
  serverRoadmapId: string | null
  addPendingActivityChange: (change: ActivityChange) => void
  showToast: (message: string) => void
  onSuccess: () => void
  onSessionExpired: () => void
  beginFocusedWrite: () => void
  endFocusedWrite: () => void
}

interface UsePhaseMutationsCoreParams extends UsePhaseMutationsParams {
  sessionToken: string | null
  updatedAt: string | null
  setUpdatedAt: (updatedAt: string) => void
}

interface UsePhaseMutationsResult {
  handleAddPhase: () => string | null
  handleUpdatePhaseColor: (phaseId: string, color: string) => void
  handleUpdatePhaseColorMode: (phaseId: string, colorMode: PhaseColorMode) => void
  handleUpdatePhaseName: (phaseId: string, name: string) => void
  handleReorderPhases: (phaseIds: string[]) => void
  handleDeletePhase: (phaseId: string) => void
}

/** Connected workspace adapter. Keep context reads here and mutation logic in the core. */
export function usePhaseMutations(params: UsePhaseMutationsParams): UsePhaseMutationsResult {
  const { updatedAt, setUpdatedAt } = useRoadmapData()
  const { sessionToken } = useRoadmapSession()
  return usePhaseMutationsCore({
    ...params,
    sessionToken,
    updatedAt,
    setUpdatedAt,
  })
}

/** Dependency-injected phase mutation core for reuse and isolated testing. */
export function usePhaseMutationsCore({
  phases,
  setPhases,
  setSaved,
  readOnly,
  serverRoadmapId,
  sessionToken,
  updatedAt,
  setUpdatedAt,
  addPendingActivityChange,
  showToast,
  onSuccess,
  onSessionExpired,
  beginFocusedWrite,
  endFocusedWrite,
}: UsePhaseMutationsCoreParams): UsePhaseMutationsResult {
  const {
    createSyncedPhase,
    deleteSyncedPhase,
    reorderSyncedPhases,
    waitForPhaseReady,
  } = usePhaseStructureSync({
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
  })
  const { patchSyncedPhase } = usePhasePatch({
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
  })

  const handleAddPhase = useCallback(() => {
    if (readOnly) return null

    const phase = createPhase(phases)
    const activity: ActivityChange = {
      action: 'phase.created',
      entity_type: 'phase',
      entity_id: phase.id,
      phaseId: phase.id,
      phaseName: phase.name,
      phaseNum: phase.num,
      details: `${phase.num} — ${phase.name}`,
    }
    if (createSyncedPhase(phase, {
      onAggregateFallback: () => addPendingActivityChange(activity),
    })) {
      return phase.id
    }

    setPhases([...phases, phase])
    addPendingActivityChange(activity)
    setSaved(false)
    return phase.id
  }, [
    addPendingActivityChange,
    createSyncedPhase,
    phases,
    readOnly,
    setPhases,
    setSaved,
  ])

  const handleUpdatePhaseColor = useCallback((phaseId: string, color: string) => {
    if (readOnly) return

    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || (phase.color === color && phase.colorMode === 'manual')) return
    const activity: ActivityChange = {
      action: 'phase.updated',
      entity_type: 'phase',
      entity_id: phase.id,
      phaseId: phase.id,
      phaseName: phase.name,
      phaseNum: phase.num,
      phaseField: 'color',
      previousValue: phase.color,
      nextValue: color,
      details: `${phase.num} — ${phase.name}`,
    }
    if (patchSyncedPhase({
      phaseId,
      updates: { color, colorMode: 'manual' },
      onAggregateFallback: () => addPendingActivityChange(activity),
    })) return

    setPhases(
      phases.map((p) => (
        p.id === phaseId ? { ...p, color, colorMode: 'manual' as const } : p
      )),
    )
    addPendingActivityChange(activity)
    setSaved(false)
  }, [
    addPendingActivityChange,
    patchSyncedPhase,
    phases,
    readOnly,
    setPhases,
    setSaved,
  ])

  const handleUpdatePhaseColorMode = useCallback((
    phaseId: string,
    colorMode: PhaseColorMode,
  ) => {
    if (readOnly) return
    const phase = phases.find((item) => item.id === phaseId)
    if (!phase || phase.colorMode === colorMode) return
    const activity: ActivityChange = {
      action: 'phase.updated',
      entity_type: 'phase',
      entity_id: phase.id,
      phaseId: phase.id,
      phaseName: phase.name,
      phaseNum: phase.num,
      phaseField: 'colorMode',
      previousValue: phase.colorMode,
      nextValue: colorMode,
      details: `${phase.num} — ${phase.name}`,
    }
    if (patchSyncedPhase({
      phaseId,
      updates: { colorMode },
      onAggregateFallback: () => addPendingActivityChange(activity),
    })) return

    setPhases(phases.map((item) => (
      item.id === phaseId ? { ...item, colorMode } : item
    )))
    addPendingActivityChange(activity)
    setSaved(false)
  }, [
    addPendingActivityChange,
    patchSyncedPhase,
    phases,
    readOnly,
    setPhases,
    setSaved,
  ])

  const handleUpdatePhaseName = useCallback((phaseId: string, name: string) => {
    if (readOnly) return

    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || phase.name === name) return
    const activity: ActivityChange = {
      action: 'phase.updated',
      entity_type: 'phase',
      entity_id: phase.id,
      phaseId: phase.id,
      phaseName: name,
      phaseNum: phase.num,
      phaseField: 'name',
      previousValue: phase.name,
      nextValue: name,
      details: `${phase.num} — ${name}`,
    }
    if (patchSyncedPhase({
      phaseId,
      updates: { name },
      onAggregateFallback: () => addPendingActivityChange(activity),
    })) return

    setPhases(
      phases.map((p) => (p.id === phaseId ? { ...p, name } : p)),
    )
    addPendingActivityChange(activity)
    setSaved(false)
  }, [
    addPendingActivityChange,
    patchSyncedPhase,
    phases,
    readOnly,
    setPhases,
    setSaved,
  ])

  const handleReorderPhases = useCallback((phaseIds: string[]) => {
    if (readOnly) return
    const uniqueIds = new Set(phaseIds)
    const isExactPhaseSet = phaseIds.length === phases.length
      && uniqueIds.size === phases.length
      && phases.every((phase) => uniqueIds.has(phase.id))
    const orderChanged = phaseIds.some((id, index) => id !== phases[index]?.id)
    if (!isExactPhaseSet || !orderChanged) return

    const activity: ActivityChange = {
      action: 'phase.reordered',
      entity_type: 'roadmap',
      entity_id: serverRoadmapId || undefined,
      details: `${phases.length} phases`,
    }
    if (reorderSyncedPhases(phaseIds, {
      onAggregateFallback: () => addPendingActivityChange(activity),
    })) return

    setPhases(orderPhasesByPreference(phases, phaseIds))
    addPendingActivityChange(activity)
    setSaved(false)
  }, [
    addPendingActivityChange,
    phases,
    readOnly,
    reorderSyncedPhases,
    serverRoadmapId,
    setPhases,
    setSaved,
  ])

  const handleDeletePhase = useCallback((phaseId: string) => {
    if (readOnly) return
    const phase = phases.find((item) => item.id === phaseId)
    if (!phase) return

    const activity: ActivityChange = {
      action: 'phase.deleted',
      entity_type: 'phase',
      entity_id: phase.id,
      phaseId: phase.id,
      phaseName: phase.name,
      phaseNum: phase.num,
      details: `${phase.num} — ${phase.name}`,
    }
    if (deleteSyncedPhase(phaseId, {
      onAggregateFallback: () => addPendingActivityChange(activity),
    })) return

    setPhases(removePhaseAndDanglingDependencies(phases, phaseId))
    addPendingActivityChange(activity)
    setSaved(false)
  }, [
    addPendingActivityChange,
    deleteSyncedPhase,
    phases,
    readOnly,
    setPhases,
    setSaved,
  ])

  return {
    handleAddPhase,
    handleUpdatePhaseColor,
    handleUpdatePhaseColorMode,
    handleUpdatePhaseName,
    handleReorderPhases,
    handleDeletePhase,
  }
}
