import type { Phase } from '@/types/roadmap'

const DEFAULT_PHASE_COLOR = '#76746e'

function nextPhaseId(phases: Phase[]): string {
  const existingIds = new Set(phases.map((phase) => phase.id))
  let candidate = phases.length + 1

  while (existingIds.has(`rf-p-${candidate}`)) {
    candidate += 1
  }

  return `rf-p-${candidate}`
}

export function createPhase(phases: Phase[]): Phase {
  return {
    id: nextPhaseId(phases),
    num: String(phases.length + 1).padStart(2, '0'),
    name: 'New phase',
    color: DEFAULT_PHASE_COLOR,
    colorMode: 'auto',
    status: phases.length === 0 ? 'active' : 'future',
    progress: 0,
    tasks: [],
  }
}

/**
 * Creates the initial state for a blank roadmap.
 * Contains one empty starter phase.
 */
export function createBlankPhases(): Phase[] {
  return [{ ...createPhase([]), name: 'Planning' }]
}
