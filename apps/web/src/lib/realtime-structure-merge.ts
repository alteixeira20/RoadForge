import { normalizePhasesProgress } from '@/lib/phase-progress'
import type { Phase } from '@/types/roadmap'

export type RealtimePhaseField = 'name' | 'color' | 'colorMode'
export type RealtimeRoadmapField = 'name'

const PHASE_FIELDS = new Set<RealtimePhaseField>(['name', 'color', 'colorMode'])
const ROADMAP_FIELDS = new Set<RealtimeRoadmapField>(['name'])

export function getRealtimePhaseFields(fields: readonly string[] | undefined): RealtimePhaseField[] {
  if (!fields) return []
  return [...new Set(fields.filter((field): field is RealtimePhaseField => (
    PHASE_FIELDS.has(field as RealtimePhaseField)
  )))]
}

export function getRealtimeRoadmapFields(fields: readonly string[] | undefined): RealtimeRoadmapField[] {
  if (!fields) return []
  return [...new Set(fields.filter((field): field is RealtimeRoadmapField => (
    ROADMAP_FIELDS.has(field as RealtimeRoadmapField)
  )))]
}

/**
 * Rebase authoritative phase-field changes onto the current local roadmap
 * without replacing unrelated local phase/task edits.
 *
 * Returns null when any requested phase is missing from either side. The
 * caller must not advance its server revision in that case because it cannot
 * prove every requested server field was incorporated locally.
 */
export function mergeAuthoritativePhaseFieldsIntoLocalPhases(
  localPhases: Phase[],
  serverPhases: Phase[],
  phaseFields: ReadonlyMap<string, ReadonlySet<RealtimePhaseField>>,
): Phase[] | null {
  if (phaseFields.size === 0) return null

  const localById = new Map(localPhases.map((phase) => [phase.id, phase]))
  const serverById = new Map(serverPhases.map((phase) => [phase.id, phase]))

  for (const [phaseId, fields] of phaseFields) {
    if (fields.size === 0) continue
    if (!localById.has(phaseId) || !serverById.has(phaseId)) return null
  }

  const nextPhases = localPhases.map((phase) => {
    const fields = phaseFields.get(phase.id)
    if (!fields || fields.size === 0) return phase
    const authoritative = serverById.get(phase.id)
    if (!authoritative) return phase

    const nextPhase = { ...phase }
    for (const field of fields) {
      Object.assign(nextPhase, { [field]: authoritative[field] })
    }
    return nextPhase
  })

  return normalizePhasesProgress(nextPhases)
}
