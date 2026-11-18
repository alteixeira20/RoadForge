import type { Phase, Task } from '@/types/roadmap'
import type { MatchStrategy } from './types'
import { type RoadmapIndex, type TaskEntry, normalizeKey } from './indexRoadmap'

export interface PhaseMatch {
  current: Phase | null
  strategy: MatchStrategy
}

export interface TaskMatch {
  current: TaskEntry | null
  strategy: MatchStrategy
}

export function matchPhase(imported: Phase, index: RoadmapIndex): PhaseMatch {
  const idMatch = index.phaseById.get(imported.id)
  if (idMatch) return { current: idMatch, strategy: 'id' }

  const nameMatches = index.phasesByNormalizedName.get(normalizeKey(imported.name)) ?? []
  if (nameMatches.length === 1) return { current: nameMatches[0], strategy: 'fallback' }

  return { current: null, strategy: 'none' }
}

// Task fallback only applies within the matched current phase, not globally.
export function matchTask(
  imported: Task,
  currentPhaseId: string,
  index: RoadmapIndex,
): TaskMatch {
  const idMatch = index.taskById.get(imported.id)
  if (idMatch) return { current: idMatch, strategy: 'id' }

  const titleKey = `${currentPhaseId}:${normalizeKey(imported.title)}`
  const titleMatches = index.tasksByPhaseAndTitle.get(titleKey) ?? []
  if (titleMatches.length === 1) return { current: titleMatches[0], strategy: 'fallback' }

  return { current: null, strategy: 'none' }
}
