import { renumberPhases } from '@/lib/phase-progress'
import type { Phase } from '@/types/roadmap'

export function removePhaseAndDanglingDependencies(
  phases: Phase[],
  phaseId: string,
): Phase[] {
  const deleted = phases.find((phase) => phase.id === phaseId)
  if (!deleted) return phases

  const deletedTaskIds = new Set(deleted.tasks.map((task) => task.id))
  const remaining = phases
    .filter((phase) => phase.id !== phaseId)
    .map((phase) => ({
      ...phase,
      tasks: phase.tasks.map((task) => {
        if (!task.deps?.some((dependencyId) => deletedTaskIds.has(dependencyId))) {
          return task
        }
        return {
          ...task,
          deps: task.deps.filter((dependencyId) => !deletedTaskIds.has(dependencyId)),
        }
      }),
    }))

  return renumberPhases(remaining)
}

/**
 * Apply a preferred order to the phases currently known by this browser.
 * IDs absent locally are ignored; local-only IDs are retained in their current
 * relative order after the requested IDs. This mirrors the server merge contract.
 */
export function orderPhasesByPreference(phases: Phase[], phaseIds: string[]): Phase[] {
  const byId = new Map(phases.map((phase) => [phase.id, phase]))
  const seen = new Set<string>()
  const ordered: Phase[] = []

  for (const phaseId of phaseIds) {
    const phase = byId.get(phaseId)
    if (!phase || seen.has(phaseId)) continue
    ordered.push(phase)
    seen.add(phaseId)
  }

  for (const phase of phases) {
    if (seen.has(phase.id)) continue
    ordered.push(phase)
  }

  return renumberPhases(ordered)
}

/**
 * Roll back an optimistic phase deletion without replacing surviving phases.
 * The deleted phase itself comes from the pre-delete snapshot, while every
 * still-present phase keeps its current task/field contents. The old order is
 * then used only as a preferred structural order.
 */
export function restoreDeletedPhase(
  currentPhases: Phase[],
  beforeDelete: Phase[],
  phaseId: string,
): Phase[] {
  if (currentPhases.some((phase) => phase.id === phaseId)) {
    return orderPhasesByPreference(currentPhases, beforeDelete.map((phase) => phase.id))
  }
  const deleted = beforeDelete.find((phase) => phase.id === phaseId)
  if (!deleted) return currentPhases
  return orderPhasesByPreference(
    [...currentPhases, deleted],
    beforeDelete.map((phase) => phase.id),
  )
}

/**
 * Roll back only phase ordering. Current phase objects remain authoritative for
 * local task/field edits; phases created after the failed reorder are retained.
 */
export function restorePhaseOrder(
  currentPhases: Phase[],
  beforeReorder: Phase[],
): Phase[] {
  return orderPhasesByPreference(currentPhases, beforeReorder.map((phase) => phase.id))
}

/**
 * Reconcile acknowledgement of a focused create without replacing unrelated
 * local phase/task content. Server-owned sequence/status/progress are accepted;
 * mutable phase fields remain local because the name/color editor may already
 * contain a newer optimistic focused write waiting behind the creation barrier.
 */
export function reconcileCreatedPhaseAcknowledgement(
  localPhases: Phase[],
  serverPhases: Phase[],
  phaseId: string,
): Phase[] | null {
  const serverPhase = serverPhases.find((phase) => phase.id === phaseId)
  if (!serverPhase) return null

  const localPhase = localPhases.find((phase) => phase.id === phaseId)
  const next = localPhase
    ? localPhases.map((phase) => (
        phase.id === phaseId
          ? {
              ...phase,
              num: serverPhase.num,
              status: serverPhase.status,
              progress: serverPhase.progress,
            }
          : phase
      ))
    : [...localPhases, serverPhase]

  return orderPhasesByPreference(next, serverPhases.map((phase) => phase.id))
}
