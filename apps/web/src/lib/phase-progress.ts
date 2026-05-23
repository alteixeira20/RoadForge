import type { Phase } from '@/types/roadmap'

export function computePhaseProgress(phase: Phase): number {
  const total = phase.tasks.length
  if (total === 0) return 0
  const done = phase.tasks.filter((t) => t.done).length
  return Math.round((done / total) * 100)
}

export function normalizePhaseProgress(phase: Phase): Phase {
  const progress = computePhaseProgress(phase)
  if (phase.progress === progress) return phase
  return { ...phase, progress }
}

export function normalizePhasesProgress(phases: Phase[]): Phase[] {
  return phases.map(normalizePhaseProgress)
}
