import { getTaskAssignees, getVisibleTaskTags, taskMatchesAssignee } from '@/lib/task-assignment'
import type { FilterState, Phase, Task } from '@/types/roadmap'

export const DEFAULT_FILTER_STATE: FilterState = {
  query: '',
  status: 'all',
  assignees: [],
  tags: [],
  phaseIds: [],
  claim: 'all',
  recommended: false,
}

export interface TaskFilterContext {
  displayName: string
  participantId: string | null
  tagLabels?: ReadonlyMap<string, string>
}

const normalize = (value: string) => value.trim().toLocaleLowerCase()

function matchesQuery(
  task: Task,
  phase: Phase,
  query: string,
  tagLabels: ReadonlyMap<string, string>,
): boolean {
  const terms = [
    task.title,
    task.desc ?? '',
    phase.name,
    ...getTaskAssignees(task),
    ...getVisibleTaskTags(task),
    ...getVisibleTaskTags(task).map((tag) => tagLabels.get(tag) ?? ''),
  ]
  return terms.some((value) => normalize(value).includes(query))
}

function matchesClaim(
  task: Task,
  claim: FilterState['claim'],
  context: TaskFilterContext,
): boolean {
  if (claim === 'all') return true
  if (claim === 'claimed') return Boolean(task.claimedBy)
  if (claim === 'unclaimed') return !task.claimedBy
  if (!task.claimedBy) return false
  if (context.participantId && task.claimedById) {
    return task.claimedById === context.participantId
  }
  return normalize(task.claimedBy) === normalize(context.displayName)
}

export function taskMatchesFilters(
  task: Task,
  phase: Phase,
  filters: FilterState,
  context: TaskFilterContext,
): boolean {
  const query = normalize(filters.query)
  const tagLabels = context.tagLabels ?? new Map<string, string>()

  if (query && !matchesQuery(task, phase, query, tagLabels)) return false
  if (filters.status === 'open' && task.done) return false
  if (filters.status === 'done' && !task.done) return false
  const matchesAssignee = filters.assignees.length === 0 || filters.assignees.some(
    (assignee) => assignee === '__mine__'
      ? taskMatchesAssignee(task, context.displayName)
      : taskMatchesAssignee(task, assignee),
  )
  if (!matchesAssignee) {
    return false
  }
  const taskTags = getVisibleTaskTags(task)
  if (filters.tags.length > 0 && !filters.tags.some((tag) => taskTags.includes(tag))) {
    return false
  }
  if (!matchesClaim(task, filters.claim, context)) return false
  if (filters.recommended && task.next !== true) return false
  return true
}

export function filterTasks(
  phases: Phase[],
  filters: FilterState,
  context: TaskFilterContext,
): Phase[] {
  return phases
    .filter((phase) =>
      filters.phaseIds.length === 0 || filters.phaseIds.includes(phase.id),
    )
    .map((phase) => ({
      ...phase,
      tasks: phase.tasks.filter((task) =>
        taskMatchesFilters(task, phase, filters, context),
      ),
    }))
    .filter((phase) => phase.tasks.length > 0)
}

export function isFilterStateActive(filters: FilterState): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.status !== 'all' ||
    filters.assignees.length > 0 ||
    filters.tags.length > 0 ||
    filters.phaseIds.length > 0 ||
    filters.claim !== 'all' ||
    filters.recommended
  )
}
