import {
  orderPhasesByPreference,
  removePhaseAndDanglingDependencies,
} from '@/lib/phase-structure-merge'
import type { Phase } from '@/types/roadmap'

/**
 * Merge the final authoritative server structure for phase IDs affected by
 * remote create/delete activity while preserving every unrelated local phase
 * object. A server-present affected ID is authoritative as an entity (new or
 * recreated), while a final-absent affected ID is removed with dependency
 * cleanup. Server-known phase order is then applied as a preference; local-only
 * pending phases remain after the server-known set in their local relative order.
 */
export function mergeAuthoritativePhaseStructureIntoLocalPhases(
  localPhases: Phase[],
  serverPhases: Phase[],
  affectedPhaseIds: ReadonlySet<string>,
  applyServerOrder: boolean,
): Phase[] {
  const serverById = new Map(serverPhases.map((phase) => [phase.id, phase]))
  let nextPhases = localPhases

  for (const phaseId of affectedPhaseIds) {
    const authoritativePhase = serverById.get(phaseId)
    if (!authoritativePhase) {
      nextPhases = removePhaseAndDanglingDependencies(nextPhases, phaseId)
      continue
    }

    const localIndex = nextPhases.findIndex((phase) => phase.id === phaseId)
    if (localIndex < 0) {
      nextPhases = [...nextPhases, authoritativePhase]
      continue
    }

    if (nextPhases[localIndex] === authoritativePhase) continue

    nextPhases = nextPhases.map((phase, index) => (
      index === localIndex ? authoritativePhase : phase
    ))
  }

  if (!applyServerOrder) return nextPhases
  const ordered = orderPhasesByPreference(
    nextPhases,
    serverPhases.map((phase) => phase.id),
  )
  if (ordered.length === nextPhases.length && ordered.every((p, i) => p === nextPhases[i])) {
    return nextPhases
  }
  return ordered
}

export function phaseIdsInSnapshot(phases: Phase[]): Set<string> {
  return new Set(phases.map((phase) => phase.id))
}

export function taskIdsInSnapshot(phases: Phase[]): Set<string> {
  return new Set(phases.flatMap((phase) => phase.tasks.map((task) => task.id)))
}
