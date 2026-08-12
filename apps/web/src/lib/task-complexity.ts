import type { Task, TaskComplexity } from '@/types/roadmap'

export interface TaskComplexityOption {
  value: TaskComplexity
  label: string
  rank: number
  description: string
}

export const TASK_COMPLEXITY_LEVELS: readonly TaskComplexityOption[] = [
  { value: 'very_low', label: 'Very low', rank: 1, description: 'Routine work with minimal uncertainty or coordination.' },
  { value: 'low', label: 'Low', rank: 2, description: 'Straightforward work with few moving parts.' },
  { value: 'medium', label: 'Medium', rank: 3, description: 'Normal task complexity with some coordination or uncertainty.' },
  { value: 'high', label: 'High', rank: 4, description: 'Several moving parts, dependencies, or meaningful uncertainty.' },
  { value: 'very_high', label: 'Very high', rank: 5, description: 'Too broad to execute safely as one task; it must be decomposed.' },
] as const

export const DEFAULT_TASK_COMPLEXITY: TaskComplexity = 'medium'

const COMPLEXITY_VALUES = new Set<TaskComplexity>(
  TASK_COMPLEXITY_LEVELS.map((option) => option.value),
)

export function isTaskComplexity(value: unknown): value is TaskComplexity {
  return typeof value === 'string' && COMPLEXITY_VALUES.has(value as TaskComplexity)
}

export function getTaskComplexity(task: Pick<Task, 'complexity'>): TaskComplexity {
  return isTaskComplexity(task.complexity) ? task.complexity : DEFAULT_TASK_COMPLEXITY
}

export function getTaskComplexityOption(value: TaskComplexity): TaskComplexityOption {
  return TASK_COMPLEXITY_LEVELS.find((option) => option.value === value)
    ?? TASK_COMPLEXITY_LEVELS[2]
}

export function getTaskComplexityLabel(task: Pick<Task, 'complexity'>): string {
  return getTaskComplexityOption(getTaskComplexity(task)).label
}

export function getTaskComplexityStructureIssue(
  task: Task,
  allTasks: Task[],
): string | null {
  if (getTaskComplexity(task) !== 'very_high') return null
  if (task.parentId) {
    return 'Very high complexity is only valid for top-level tasks. Break the parent work down instead.'
  }
  const directSubtasks = allTasks.filter((candidate) => candidate.parentId === task.id)
  if (directSubtasks.length < 2) {
    return 'Very high complexity tasks require at least two direct subtasks.'
  }
  return null
}
