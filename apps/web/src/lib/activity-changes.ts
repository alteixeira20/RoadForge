import { getTaskAssignees, getVisibleTaskTags } from '@/lib/task-assignment'
import type {
  ActivityAction,
  ActivityChange,
  ChangeSummary,
  Task,
  TaskActivityField,
} from '@/types/roadmap'

const taskActivityFields: TaskActivityField[] = [
  'title',
  'desc',
  'est',
  'assignees',
  'tags',
]

const taskActivityFieldLabels: Record<TaskActivityField, string> = {
  title: 'title',
  desc: 'description',
  est: 'estimate',
  assignees: 'assignees',
  tags: 'tags',
}

const changePriority: Record<ActivityAction, number> = {
  'roadmap.imported': 1,
  'import.replaced': 1,
  'roadmap.restored': 1,
  'phase.completed': 2,
  'phase.reopened': 2,
  'task.created': 3,
  'task.completed': 4,
  'task.reopened': 4,
  'task.claimed': 5,
  'task.unclaimed': 5,
  'task.dependency.linked': 5,
  'task.dependency.unlinked': 5,
  'roadmap.renamed': 6,
  'task.updated': 6,
  'task.reordered': 7,
  'roadmap.phases_reordered': 7,
  'roadmap.batch_changed': 8,
  'roadmap.updated': 9,
}

export function countKeyForAction(action: ActivityAction): string {
  switch (action) {
    case 'roadmap.imported': return 'imports'
    case 'import.replaced': return 'imports_replaced'
    case 'roadmap.restored': return 'restores'
    case 'roadmap.renamed': return 'roadmaps_renamed'
    case 'phase.completed': return 'phases_completed'
    case 'phase.reopened': return 'phases_reopened'
    case 'task.created': return 'tasks_added'
    case 'task.completed': return 'tasks_completed'
    case 'task.reopened': return 'tasks_reopened'
    case 'task.dependency.linked': return 'dependencies_linked'
    case 'task.dependency.unlinked': return 'dependencies_unlinked'
    case 'task.updated': return 'tasks_updated'
    case 'task.reordered': return 'tasks_reordered'
    case 'roadmap.phases_reordered': return 'phases_reordered'
    default: return 'updates'
  }
}

export function dedupeKey(change: ActivityChange): string {
  if (change.taskId) return `task:${change.taskId}`
  if (change.phaseId) return `phase:${change.phaseId}`
  if (change.action === 'roadmap.renamed') return 'roadmap:renamed'
  return `${change.action}:${change.entity_id || change.roadmapName || 'roadmap'}`
}

export function areOppositeActions(a: ActivityAction, b: ActivityAction): boolean {
  return (
    (a === 'task.completed' && b === 'task.reopened') ||
    (a === 'task.reopened' && b === 'task.completed') ||
    (a === 'phase.completed' && b === 'phase.reopened') ||
    (a === 'phase.reopened' && b === 'phase.completed')
  )
}

function stringListsMatch(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.every((item, index) => item === right[index])
}

export function getChangedTaskFields(
  task: Task,
  updates: Partial<Task>,
): TaskActivityField[] {
  return taskActivityFields.filter((field) => {
    if (!(field in updates)) return false
    if (field === 'assignees') {
      return !stringListsMatch(getTaskAssignees(task), updates.assignees ?? [])
    }
    if (field === 'tags') {
      return !stringListsMatch(getVisibleTaskTags(task), updates.tags ?? [])
    }
    return (task[field] ?? '') !== (updates[field] ?? '')
  })
}

function readChangedTaskFields(
  metadata: Record<string, unknown> | null,
): TaskActivityField[] {
  const changedFields = metadata?.changedFields
  if (!Array.isArray(changedFields)) return []
  return taskActivityFields.filter((field) => changedFields.includes(field))
}

export function getTaskUpdateLabel(metadata: Record<string, unknown> | null): string {
  const fields = readChangedTaskFields(metadata)
  if (fields.length === 1 && fields[0] === 'title') return 'Renamed task'
  if (fields.length === 1 && fields[0] === 'desc') return 'Updated task description'
  if (fields.length > 0 && fields.every((field) => (
    field === 'est' || field === 'assignees' || field === 'tags'
  ))) {
    return 'Updated task details'
  }
  return 'Updated task'
}

export function getTaskUpdateFieldSummary(
  metadata: Record<string, unknown> | null,
): string | null {
  const labels = readChangedTaskFields(metadata).map((field) => taskActivityFieldLabels[field])
  if (labels.length === 0) return null
  if (labels.length === 1) return `${labels[0]} changed`
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} changed`
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)} changed`
}

function mergeTaskUpdateFields(
  existing: ActivityChange,
  change: ActivityChange,
): ActivityChange {
  if (!existing.changedFields || !change.changedFields) return change
  const changedFields = taskActivityFields.filter((field) => (
    existing.changedFields?.includes(field) || change.changedFields?.includes(field)
  ))
  return { ...change, changedFields }
}

export function mergePendingActivityChange(prev: ActivityChange[], change: ActivityChange): ActivityChange[] {
  const key = dedupeKey(change)
  const existing = prev.find((item) => dedupeKey(item) === key)
  if (existing && areOppositeActions(existing.action, change.action)) {
    return prev.filter((item) => dedupeKey(item) !== key)
  }
  if (existing?.action === 'task.created' && change.action === 'task.updated') {
    return prev.map((item) => (
      dedupeKey(item) === key ? { ...item, taskTitle: change.taskTitle || item.taskTitle } : item
    ))
  }
  if (existing && existing.action === change.action) {
    const merged = change.action === 'task.updated'
      ? mergeTaskUpdateFields(existing, change)
      : change
    return prev.map((item) => (dedupeKey(item) === key ? merged : item))
  }
  return [...prev, change]
}

export function buildChangeSummary(changes: ActivityChange[], serverRoadmapId?: string | null): ChangeSummary | null {
  if (changes.length === 0) return null
  if (changes.length === 1) return changes[0]

  const counts = changes.reduce<Record<string, number>>((acc, change) => {
    const key = countKeyForAction(change.action)
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const primaryChange = [...changes].sort((a, b) => changePriority[a.action] - changePriority[b.action])[0]
  return {
    action: 'roadmap.batch_changed',
    entity_type: 'roadmap',
    entity_id: serverRoadmapId || undefined,
    changes,
    counts,
    primary_change: primaryChange,
  }
}
