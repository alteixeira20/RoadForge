import type { Task } from '@/types/roadmap'

export function generateTaskId(allTasks: Task[]): string {
  const rfIds = allTasks
    .map((t) => t.id)
    .filter((id) => id.startsWith('RF-'))
    .map((id) => parseInt(id.replace('RF-', ''), 10))
    .filter((n) => !isNaN(n))

  if (rfIds.length === 0) return `TASK-${Date.now().toString().slice(-6)}`

  const nextId = Math.max(...rfIds) + 1
  return `RF-${nextId.toString().padStart(2, '0')}`
}

export function hasCycle(taskId: string, depId: string, allTasks: Task[]): boolean {
  const taskMap = new Map(allTasks.map((t) => [t.id, t]))
  const visited = new Set<string>()

  const isReachable = (startId: string, targetId: string): boolean => {
    if (startId === targetId) return true
    if (visited.has(startId)) return false
    visited.add(startId)

    const task = taskMap.get(startId)
    if (!task?.deps) return false

    for (const d of task.deps) {
      if (isReachable(d, targetId)) return true
    }
    return false
  }

  return isReachable(depId, taskId)
}
