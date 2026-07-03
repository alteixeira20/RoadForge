import { getTaskAssignees, getVisibleTaskTags } from '@/lib/task-assignment'
import type { ActivityChange, Phase, Task } from '@/types/roadmap'

export type InlineTaskField = 'title' | 'est' | 'desc' | 'tags' | 'assignees'
export type InlineTaskListField = Extract<InlineTaskField, 'tags' | 'assignees'>

const LIST_FIELDS: readonly InlineTaskListField[] = ['tags', 'assignees']

function isListField(field: InlineTaskField): field is InlineTaskListField {
  return (LIST_FIELDS as readonly string[]).includes(field)
}

export type CommitTaskFieldResult =
  | {
      ok: true
      changed: boolean
      task: Task
      updates: Partial<Task>
    }
  | {
      ok: false
      reason: 'empty-title'
      task: Task
    }

function commitListField(
  task: Task,
  field: InlineTaskListField,
  value: string[],
): CommitTaskFieldResult {
  const previous = field === 'tags' ? getVisibleTaskTags(task) : getTaskAssignees(task)
  const updates: Partial<Task> = { [field]: value }
  const unchanged = previous.length === value.length
    && previous.every((item, index) => item === value[index])
  if (unchanged) {
    return { ok: true, changed: false, task, updates }
  }

  return {
    ok: true,
    changed: true,
    task: { ...task, ...updates },
    updates,
  }
}

export function commitTaskField(
  task: Task,
  field: InlineTaskField,
  value: string | string[],
): CommitTaskFieldResult {
  if (isListField(field)) {
    return commitListField(task, field, value as string[])
  }

  const strValue = value as string
  const normalizedValue = field === 'desc' ? strValue : strValue.trim()
  if (field === 'title' && !normalizedValue) {
    return { ok: false, reason: 'empty-title', task }
  }

  const updates: Partial<Task> = { [field]: normalizedValue }
  if ((task[field] ?? '') === normalizedValue) {
    return { ok: true, changed: false, task, updates }
  }

  return {
    ok: true,
    changed: true,
    task: { ...task, ...updates },
    updates,
  }
}

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
