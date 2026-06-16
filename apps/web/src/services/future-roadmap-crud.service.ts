import type { Phase, Task } from '@/types/roadmap'

function deferredEndpoint(name: string): never {
  throw new Error(`${name} is not implemented; Anvilary currently uses aggregate saves.`)
}

export async function addPhase(
  _roadmapId: string,
  _name: string,
): Promise<Phase> {
  return deferredEndpoint('addPhase')
}

export async function reorderPhases(
  _roadmapId: string,
  _phaseIds: string[],
): Promise<void> {
  return deferredEndpoint('reorderPhases')
}

export async function addTask(
  _roadmapId: string,
  _phaseId: string,
  _task: Omit<Task, 'id'>,
): Promise<Task> {
  return deferredEndpoint('addTask')
}

export async function linkDependency(
  _roadmapId: string,
  _taskId: string,
  _depId: string,
): Promise<void> {
  return deferredEndpoint('linkDependency')
}
