import type { Roadmap, Task } from '@/shared/types/roadmap'
import { requestJson } from '@/shared/http/roadmap-http'
import { toRoadmap, type ApiRoadmapResponse } from '@/shared/http/roadmap-response'

export interface PatchTaskDoneParams {
  roadmapId: string
  taskId: string
  done: boolean
  sessionToken: string
  lastUpdatedAt: string
}

export type PatchTaskUpdates = Partial<Pick<
  Task,
  'title' | 'desc' | 'est' | 'complexity' | 'assignees' | 'tags' | 'links'
>>
export interface PatchTaskParams {
  roadmapId: string
  taskId: string
  updates: PatchTaskUpdates
  sessionToken: string
  lastUpdatedAt: string
}

export interface PatchTaskClaimParams {
  roadmapId: string
  taskId: string
  sessionToken: string
  override?: boolean
}

export async function patchTask({
  roadmapId,
  taskId,
  updates,
  sessionToken,
  lastUpdatedAt,
}: PatchTaskParams): Promise<Roadmap> {
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${roadmapId}/tasks/${taskId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        ...updates,
        last_updated_at: lastUpdatedAt,
      }),
    },
    sessionToken,
  )
  return toRoadmap(data)
}

/**
 * Toggle a task's done state through the first partial roadmap write endpoint.
 */
export async function patchTaskDone({
  roadmapId,
  taskId,
  done,
  sessionToken,
  lastUpdatedAt,
}: PatchTaskDoneParams): Promise<Roadmap> {
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${roadmapId}/tasks/${taskId}/done`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        done,
        last_updated_at: lastUpdatedAt,
      }),
    },
    sessionToken,
  )
  return toRoadmap(data)
}

export async function patchTaskClaim({
  roadmapId,
  taskId,
  sessionToken,
  override = false,
}: PatchTaskClaimParams): Promise<Roadmap> {
  const query = override ? '?override=true' : ''
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${roadmapId}/tasks/${taskId}/claim${query}`,
    { method: 'PATCH' },
    sessionToken,
  )
  return toRoadmap(data)
}

export async function deleteTaskClaim({
  roadmapId,
  taskId,
  sessionToken,
  override = false,
}: PatchTaskClaimParams): Promise<Roadmap> {
  const query = override ? '?override=true' : ''
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${roadmapId}/tasks/${taskId}/claim${query}`,
    { method: 'DELETE' },
    sessionToken,
  )
  return toRoadmap(data)
}

/**
 * Export the roadmap as a downloadable blob.
 * Portable roadmap-only formats run client-side.
 */
