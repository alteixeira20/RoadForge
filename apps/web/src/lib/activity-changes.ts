import type { ActivityAction, ActivityChange, ChangeSummary } from '@/types/roadmap'

const changePriority: Record<ActivityAction, number> = {
  'roadmap.imported': 1,
  'roadmap.restored': 1,
  'phase.completed': 2,
  'phase.reopened': 2,
  'task.created': 3,
  'task.completed': 4,
  'task.reopened': 4,
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
    return prev.map((item) => (dedupeKey(item) === key ? change : item))
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
