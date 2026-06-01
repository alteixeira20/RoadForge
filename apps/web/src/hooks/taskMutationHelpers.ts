import type { ActivityChange, Phase, Task } from '@/types/roadmap'

export function findPhaseForTask(phases: Phase[], taskId: string): Phase | undefined {
  return phases.find((phase) => phase.tasks.some((task) => task.id === taskId))
}

export function isPhaseComplete(phase: Phase): boolean {
  return phase.tasks.length > 0 && phase.tasks.every((task) => task.done)
}

export function buildTaskDonePhases(taskId: string, done: boolean, phases: Phase[]): Phase[] {
  return phases.map((phase) => ({
    ...phase,
    tasks: phase.tasks.map((task) => {
      if (task.id !== taskId) return task
      if (!done) return { ...task, done }
      // Marking done clears claim so completed tasks don't stay claimed.
      const updated: Task = { ...task, done }
      delete updated.claimedBy
      delete updated.claimedById
      delete updated.claimedAt
      return updated
    }),
  }))
}

export function buildTaskDoneActivityChanges({
  task,
  affectedPhase,
  wasPhaseComplete,
  nextPhases,
}: {
  task: Task
  affectedPhase: Phase | undefined
  wasPhaseComplete: boolean
  nextPhases: Phase[]
}): ActivityChange[] {
  const nextPhase = affectedPhase ? nextPhases.find((phase) => phase.id === affectedPhase.id) : null
  const isNowPhaseComplete = nextPhase ? isPhaseComplete(nextPhase) : false
  const changes: ActivityChange[] = [{
    action: task.done ? 'task.reopened' : 'task.completed',
    entity_type: 'task',
    entity_id: task.id,
    taskId: task.id,
    taskTitle: task.title,
    phaseId: affectedPhase?.id,
    phaseName: affectedPhase?.name,
  }]

  if (!affectedPhase) return changes
  if (task.done && wasPhaseComplete && !isNowPhaseComplete) {
    changes.push(buildPhaseActivityChange('phase.reopened', affectedPhase))
  } else if (!task.done && !wasPhaseComplete && isNowPhaseComplete) {
    changes.push(buildPhaseActivityChange('phase.completed', affectedPhase))
  }
  return changes
}

function buildPhaseActivityChange(
  action: 'phase.completed' | 'phase.reopened',
  phase: Phase,
): ActivityChange {
  return {
    action,
    entity_type: 'phase',
    entity_id: phase.id,
    phaseId: phase.id,
    phaseName: phase.name,
    phaseNum: phase.num,
    details: `${phase.num} — ${phase.name}`,
  }
}
