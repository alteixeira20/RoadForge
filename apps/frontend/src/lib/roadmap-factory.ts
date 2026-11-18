import type { Phase } from '@/types/roadmap'

const DEFAULT_PHASE_COLOR = '#76746e'
const BLANK_PHASE_ID = 'rf-p-1'

function newPhaseId(phases: Phase[]): string {
  const existingIds = new Set(phases.map((phase) => phase.id))
  let candidate: string
  do {
    candidate = `rf-p-${crypto.randomUUID()}`
  } while (existingIds.has(candidate))
  return candidate
}

function buildEmptyPhase(
  id: string,
  index: number,
  name: string,
): Phase {
  return {
    id,
    num: String(index + 1).padStart(2, '0'),
    name,
    color: DEFAULT_PHASE_COLOR,
    colorMode: 'auto',
    status: index === 0 ? 'active' : 'future',
    progress: 0,
    tasks: [],
  }
}

/**
 * Create a user-added phase with a collision-resistant client ID.
 *
 * Synced collaborators can add phases concurrently. Sequence-derived IDs such
 * as `rf-p-3` collide by design when two clients start from the same snapshot,
 * so new interactive phases use Web Crypto UUIDs while imported/legacy IDs are
 * preserved unchanged.
 */
export function createPhase(phases: Phase[]): Phase {
  return buildEmptyPhase(newPhaseId(phases), phases.length, 'New phase')
}

/**
 * Creates the initial state for a blank roadmap.
 * The starter phase keeps its historic deterministic ID because it is created
 * before collaboration exists and this avoids needless portable-format churn.
 */
export function createBlankPhases(): Phase[] {
  return [buildEmptyPhase(BLANK_PHASE_ID, 0, 'Planning')]
}
