import { useCallback } from 'react'
import { createPhase } from '@/lib/roadmap-factory'
import { renumberPhases } from '@/lib/phase-progress'
import type { ActivityChange, Phase, PhaseColorMode } from '@/types/roadmap'
import type { PatchPhaseFields } from '@/services/roadmap-structure.service'

interface UsePhaseMutationsParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  readOnly: boolean
  serverRoadmapId: string | null
  addPendingActivityChange: (change: ActivityChange) => void
  patchSyncedPhase?: (params: { phaseId: string; updates: PatchPhaseFields }) => boolean
}

interface UsePhaseMutationsResult {
  handleAddPhase: () => string | null
  handleUpdatePhaseColor: (phaseId: string, color: string) => void
  handleUpdatePhaseColorMode: (phaseId: string, colorMode: PhaseColorMode) => void
  handleUpdatePhaseName: (phaseId: string, name: string) => void
  handleReorderPhases: (phaseIds: string[]) => void
  handleDeletePhase: (phaseId: string) => void
}

export function usePhaseMutations({
  phases,
  setPhases,
  setSaved,
  readOnly,
  serverRoadmapId,
  addPendingActivityChange,
  patchSyncedPhase,
}: UsePhaseMutationsParams): UsePhaseMutationsResult {
  const handleAddPhase = useCallback(() => {
    if (readOnly) return null

    const phase = createPhase(phases)
    setPhases([...phases, phase])
    addPendingActivityChange({
      action: 'phase.created',
      entity_type: 'phase',
      entity_id: phase.id,
      phaseId: phase.id,
      phaseName: phase.name,
      phaseNum: phase.num,
      details: `${phase.num} — ${phase.name}`,
    })
    setSaved(false)
    return phase.id
  }, [addPendingActivityChange, phases, readOnly, setPhases, setSaved])

  const handleUpdatePhaseColor = useCallback((phaseId: string, color: string) => {
    if (readOnly) return

    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || (phase.color === color && phase.colorMode === 'manual')) return
    if (patchSyncedPhase?.({
      phaseId,
      updates: { color, colorMode: 'manual' },
    })) return

    setPhases(
      phases.map((p) => (
        p.id === phaseId ? { ...p, color, colorMode: 'manual' as const } : p
      )),
    )
    addPendingActivityChange({
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
    })
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
    if (patchSyncedPhase?.({ phaseId, updates: { colorMode } })) return

    setPhases(phases.map((item) => (
      item.id === phaseId ? { ...item, colorMode } : item
    )))
    addPendingActivityChange({
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
    })
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
    if (patchSyncedPhase?.({ phaseId, updates: { name } })) return

    setPhases(
      phases.map((p) => (p.id === phaseId ? { ...p, name } : p)),
    )
    addPendingActivityChange({
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
    })
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

    const reordered = renumberPhases(
      phaseIds
        .map((id) => phases.find((p) => p.id === id))
        .filter((p): p is Phase => !!p),
    )
    setPhases(reordered)
    addPendingActivityChange({
      action: 'phase.reordered',
      entity_type: 'roadmap',
      entity_id: serverRoadmapId || undefined,
      details: `${phases.length} phases`,
    })
    setSaved(false)
  }, [
    addPendingActivityChange,
    phases,
    readOnly,
    serverRoadmapId,
    setPhases,
    setSaved,
  ])

  const handleDeletePhase = useCallback((phaseId: string) => {
    if (readOnly) return
    const phase = phases.find((item) => item.id === phaseId)
    if (!phase) return

    const remaining = phases.filter((p) => p.id !== phaseId)
    setPhases(renumberPhases(remaining))
    addPendingActivityChange({
      action: 'phase.deleted',
      entity_type: 'phase',
      entity_id: phase.id,
      phaseId: phase.id,
      phaseName: phase.name,
      phaseNum: phase.num,
      details: `${phase.num} — ${phase.name}`,
    })
    setSaved(false)
  }, [addPendingActivityChange, phases, readOnly, setPhases, setSaved])

  return {
    handleAddPhase,
    handleUpdatePhaseColor,
    handleUpdatePhaseColorMode,
    handleUpdatePhaseName,
    handleReorderPhases,
    handleDeletePhase,
  }
}
