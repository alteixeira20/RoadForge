import type { Phase } from '@/types/roadmap'

/**
 * Computes visual display numbers for all tasks in a roadmap.
 * Returns a Map<taskId, displayString> — e.g. "2.3" for the 3rd task in phase 2,
 * "2.3.1" for its first subtask. Stable task IDs are never modified.
 */
export function computeTaskDisplayNumbers(phases: Phase[]): Map<string, string> {
  const map = new Map<string, string>()

  for (const phase of phases) {
    const phaseNum = parseInt(phase.num, 10)
    const topLevelTasks = phase.tasks.filter((t) => !t.parentId)

    topLevelTasks.forEach((task, taskIdx) => {
      const taskDisplay = `${phaseNum}.${taskIdx + 1}`
      map.set(task.id, taskDisplay)

      const subtasks = phase.tasks.filter((t) => t.parentId === task.id)
      subtasks.forEach((subtask, subtaskIdx) => {
        map.set(subtask.id, `${taskDisplay}.${subtaskIdx + 1}`)
      })
    })
  }

  return map
}
