import type { Phase } from '@/types/roadmap'
import { requestJson } from './roadmap-http'

interface ApiTaskStructureMutationResponse {
  phases: Phase[]
  updated_at: string
}

export interface TaskStructureMutationResult {
  phases: Phase[]
  updatedAt: string
}

function normalize(response: ApiTaskStructureMutationResponse): TaskStructureMutationResult {
  return {
    phases: response.phases,
    updatedAt: response.updated_at,
  }
}

export async function createServerTask(
  roadmapId: string,
  phaseId: string,
  task: { id: string; title: string; parentId?: string },
  sessionToken: string,
): Promise<TaskStructureMutationResult> {
  const response = await requestJson<ApiTaskStructureMutationResponse>(
    `/api/roadmaps/${roadmapId}/phases/${encodeURIComponent(phaseId)}/tasks`,
    {
      method: 'POST',
      body: JSON.stringify({
        id: task.id,
        title: task.title,
        ...(task.parentId ? { parentId: task.parentId } : {}),
      }),
    },
    sessionToken,
  )
  return normalize(response)
}

export async function deleteServerTask(
  roadmapId: string,
  taskId: string,
  sessionToken: string,
): Promise<TaskStructureMutationResult> {
  const response = await requestJson<ApiTaskStructureMutationResponse>(
    `/api/roadmaps/${roadmapId}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' },
    sessionToken,
  )
  return normalize(response)
}

export async function reorderServerTasks(
  roadmapId: string,
  phaseId: string,
  taskIds: string[],
  sessionToken: string,
): Promise<TaskStructureMutationResult> {
  const response = await requestJson<ApiTaskStructureMutationResponse>(
    `/api/roadmaps/${roadmapId}/phases/${encodeURIComponent(phaseId)}/tasks/order`,
    {
      method: 'PUT',
      body: JSON.stringify({ task_ids: taskIds }),
    },
    sessionToken,
  )
  return normalize(response)
}

export async function reorderServerSubtasks(
  roadmapId: string,
  parentId: string,
  taskIds: string[],
  sessionToken: string,
): Promise<TaskStructureMutationResult> {
  const response = await requestJson<ApiTaskStructureMutationResponse>(
    `/api/roadmaps/${roadmapId}/tasks/${encodeURIComponent(parentId)}/subtasks/order`,
    {
      method: 'PUT',
      body: JSON.stringify({ task_ids: taskIds }),
    },
    sessionToken,
  )
  return normalize(response)
}

export async function setServerTaskDependency(
  roadmapId: string,
  taskId: string,
  dependencyId: string,
  linked: boolean,
  sessionToken: string,
): Promise<TaskStructureMutationResult> {
  const response = await requestJson<ApiTaskStructureMutationResponse>(
    `/api/roadmaps/${roadmapId}/tasks/${encodeURIComponent(taskId)}/dependencies/${encodeURIComponent(dependencyId)}`,
    { method: linked ? 'PUT' : 'DELETE' },
    sessionToken,
  )
  return normalize(response)
}
