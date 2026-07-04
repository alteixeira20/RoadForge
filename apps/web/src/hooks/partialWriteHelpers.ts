import type { Phase, Roadmap, TagDefinition, Task, TaskActivityField } from '@/types/roadmap'

interface ApplyPartialWriteResultParams {
  roadmap: Roadmap
  wasSaved: boolean
  currentSaved: boolean
  setPhases: (phases: Phase[]) => void
  setTagRegistry: (registry: TagDefinition[]) => void
  setUpdatedAt: (updatedAt: string) => void
  setSaved: (saved: boolean) => void
}

export function applyPartialWriteResult({
  roadmap,
  wasSaved,
  currentSaved,
  setPhases,
  setTagRegistry,
  setUpdatedAt,
  setSaved,
}: ApplyPartialWriteResultParams): boolean {
  setUpdatedAt(roadmap.updatedAt)
  if (!wasSaved || !currentSaved) return false

  setPhases(roadmap.phases)
  if (roadmap.tagRegistry !== undefined) {
    setTagRegistry(roadmap.tagRegistry)
  }
  setSaved(true)
  return true
}

export function mergeReturnedTaskFields(
  phases: Phase[],
  returnedPhases: Phase[],
  taskId: string,
  fields: TaskActivityField[],
): Phase[] {
  const returnedTask = returnedPhases
    .flatMap((phase) => phase.tasks)
    .find((task) => task.id === taskId)
  if (!returnedTask) return phases

  return phases.map((phase) => ({
    ...phase,
    tasks: phase.tasks.map((task) => (
      task.id === taskId ? copyTaskFields(task, returnedTask, fields) : task
    )),
  }))
}

function copyTaskFields(
  task: Task,
  returnedTask: Task,
  fields: TaskActivityField[],
): Task {
  const nextTask = { ...task }
  fields.forEach((field) => {
    if (field in returnedTask) {
      Object.assign(nextTask, { [field]: returnedTask[field] })
    } else {
      delete (nextTask as Partial<Task>)[field]
    }
  })
  return nextTask
}
