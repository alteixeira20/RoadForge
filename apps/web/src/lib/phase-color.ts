import type { Phase, Task } from '@/types/roadmap'

export interface DerivedPhaseColor {
  color: string
  reason: string
}

const COLORS = {
  complete: '#22c55e',
  active: '#f97316',
  next: '#38bdf8',
  future: '#64748b',
  blocked: '#6b7280',
}

function taskIsBlocked(task: Task, tasksById: ReadonlyMap<string, Task>): boolean {
  if (task.done || !task.deps?.length) return false
  return task.deps.some((depId) => tasksById.get(depId)?.done === false)
}

export function derivePhaseColor(phase: Phase): DerivedPhaseColor {
  if (phase.tasks.length > 0 && phase.tasks.every((task) => task.done)) {
    return { color: COLORS.complete, reason: 'All tasks are complete.' }
  }

  const openTasks = phase.tasks.filter((task) => !task.done)
  const tasksById = new Map(phase.tasks.map((task) => [task.id, task]))
  if (
    openTasks.length > 0 &&
    openTasks.every((task) => taskIsBlocked(task, tasksById))
  ) {
    return { color: COLORS.blocked, reason: 'Every open task is blocked.' }
  }

  if (openTasks.some((task) => task.claimedBy) || phase.status === 'active') {
    return { color: COLORS.active, reason: 'Work is active in this phase.' }
  }
  if (phase.status === 'next') {
    return { color: COLORS.next, reason: 'This phase is next.' }
  }
  return { color: COLORS.future, reason: 'This phase has not started.' }
}

export function getPhaseDisplayColor(phase: Phase): DerivedPhaseColor {
  if (phase.colorMode !== 'auto') {
    return { color: phase.color, reason: 'Manual color.' }
  }
  return derivePhaseColor(phase)
}
