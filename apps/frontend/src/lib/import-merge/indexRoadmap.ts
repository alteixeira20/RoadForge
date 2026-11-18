import type { Phase, Task } from '@/types/roadmap'

export interface TaskEntry {
  phase: Phase
  task: Task
}

export interface RoadmapIndex {
  phaseById: Map<string, Phase>
  phasesByNormalizedName: Map<string, Phase[]>
  taskById: Map<string, TaskEntry>
  tasksByPhaseAndTitle: Map<string, TaskEntry[]>
}

export function normalizeKey(text: string): string {
  return text.trim().toLowerCase()
}

export function indexRoadmap(phases: Phase[]): RoadmapIndex {
  const phaseById = new Map<string, Phase>()
  const phasesByNormalizedName = new Map<string, Phase[]>()
  const taskById = new Map<string, TaskEntry>()
  const tasksByPhaseAndTitle = new Map<string, TaskEntry[]>()

  for (const phase of phases) {
    phaseById.set(phase.id, phase)

    const nameKey = normalizeKey(phase.name)
    const sameNamePhases = phasesByNormalizedName.get(nameKey) ?? []
    sameNamePhases.push(phase)
    phasesByNormalizedName.set(nameKey, sameNamePhases)

    for (const task of phase.tasks) {
      const entry: TaskEntry = { phase, task }
      taskById.set(task.id, entry)

      const titleKey = `${phase.id}:${normalizeKey(task.title)}`
      const sameTitleTasks = tasksByPhaseAndTitle.get(titleKey) ?? []
      sameTitleTasks.push(entry)
      tasksByPhaseAndTitle.set(titleKey, sameTitleTasks)
    }
  }

  return { phaseById, phasesByNormalizedName, taskById, tasksByPhaseAndTitle }
}
