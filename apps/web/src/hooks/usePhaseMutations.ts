import { renumberPhases } from '@/lib/phase-progress'
import type { ActivityChange, Phase, PhaseColorMode } from '@/types/roadmap'

interface UsePhaseMutationsParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  readOnly: boolean
  serverRoadmapId: string | null
  addPendingActivityChange: (change: ActivityChange) => void
}

interface UsePhaseMutationsResult {
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
}: UsePhaseMutationsParams): UsePhaseMutationsResult {
  const handleUpdatePhaseColor = (phaseId: string, color: string) => {
    if (readOnly) return

    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || (phase.color === color && phase.colorMode === 'manual')) return

    setPhases(
      phases.map((p) => (
        p.id === phaseId ? { ...p, color, colorMode: 'manual' as const } : p
      )),
    )
    setSaved(false)
  }

  const handleUpdatePhaseColorMode = (phaseId: string, colorMode: PhaseColorMode) => {
    if (readOnly) return
    const phase = phases.find((item) => item.id === phaseId)
    if (!phase || phase.colorMode === colorMode) return
    setPhases(phases.map((item) => (
      item.id === phaseId ? { ...item, colorMode } : item
    )))
    setSaved(false)
  }

  const handleUpdatePhaseName = (phaseId: string, name: string) => {
    if (readOnly) return

    const phase = phases.find((p) => p.id === phaseId)
    if (!phase || phase.name === name) return

    setPhases(
      phases.map((p) => (p.id === phaseId ? { ...p, name } : p)),
    )
    setSaved(false)
  }

  const handleReorderPhases = (phaseIds: string[]) => {
    if (readOnly) return
    const reordered = renumberPhases(
      phaseIds
        .map((id) => phases.find((p) => p.id === id))
        .filter((p): p is Phase => !!p),
    )
    setPhases(reordered)
    addPendingActivityChange({
      action: 'roadmap.phases_reordered',
      entity_type: 'roadmap',
      entity_id: serverRoadmapId || undefined,
    })
    setSaved(false)
  }

  const handleDeletePhase = (phaseId: string) => {
    if (readOnly) return
    const remaining = phases.filter((p) => p.id !== phaseId)
    setPhases(renumberPhases(remaining))
    setSaved(false)
  }

  return {
    handleUpdatePhaseColor,
    handleUpdatePhaseColorMode,
    handleUpdatePhaseName,
    handleReorderPhases,
    handleDeletePhase,
  }
}
