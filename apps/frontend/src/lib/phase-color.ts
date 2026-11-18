import type { Phase } from '@/types/roadmap'

export interface DerivedPhaseColor {
  color: string
  reason: string
}

const COLORS = {
  complete: '#22c55e',
  inProgress: '#f97316',
  notStarted: '#64748b',
}

export function derivePhaseColor(phase: Phase): DerivedPhaseColor {
  const total = phase.tasks.length
  const done = phase.tasks.filter((task) => task.done).length

  if (total > 0 && done === total) {
    return { color: COLORS.complete, reason: 'All tasks are complete.' }
  }
  if (done > 0) {
    return { color: COLORS.inProgress, reason: 'Some tasks are complete.' }
  }
  return { color: COLORS.notStarted, reason: 'No tasks are complete yet.' }
}

export function getPhaseDisplayColor(phase: Phase): DerivedPhaseColor {
  if (phase.colorMode === 'manual') {
    return { color: phase.color, reason: 'Manual color.' }
  }
  return derivePhaseColor(phase)
}
