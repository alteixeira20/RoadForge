import type { Roadmap, TagDefinition } from '@/shared/types/roadmap'
import { requestJson } from '@/shared/http/roadmap-http'
import { toRoadmap, type ApiRoadmapResponse } from '@/shared/http/roadmap-response'

export async function listServerTags(
  roadmapId: string,
  sessionToken: string,
): Promise<TagDefinition[]> {
  return requestJson<TagDefinition[]>(`/api/roadmaps/${roadmapId}/tags`, {}, sessionToken)
}

export async function createServerTag(
  roadmapId: string,
  tag: { id?: string; label: string; color?: string | null },
  sessionToken: string,
  lastUpdatedAt?: string | null,
): Promise<Roadmap> {
  const body: { id?: string; label: string; color?: string | null; last_updated_at?: string } = { ...tag }
  if (lastUpdatedAt) body.last_updated_at = lastUpdatedAt
  const data = await requestJson<ApiRoadmapResponse>(`/api/roadmaps/${roadmapId}/tags`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, sessionToken)
  return toRoadmap(data)
}

export async function updateServerTag(
  roadmapId: string,
  tagId: string,
  updates: { label?: string; color?: string | null },
  sessionToken: string,
  lastUpdatedAt?: string | null,
): Promise<Roadmap> {
  const body: { label?: string; color?: string | null; last_updated_at?: string } = { ...updates }
  if (lastUpdatedAt) body.last_updated_at = lastUpdatedAt
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${roadmapId}/tags/${encodeURIComponent(tagId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
    sessionToken,
  )
  return toRoadmap(data)
}

export async function deleteServerTag(
  roadmapId: string,
  tagId: string,
  sessionToken: string,
  lastUpdatedAt?: string | null,
): Promise<Roadmap> {
  const query = lastUpdatedAt ? `?${new URLSearchParams({ last_updated_at: lastUpdatedAt })}` : ''
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${roadmapId}/tags/${encodeURIComponent(tagId)}${query}`,
    {
      method: 'DELETE',
    },
    sessionToken,
  )
  return toRoadmap(data)
}

export async function reorderServerTags(
  roadmapId: string,
  tagIds: string[],
  sessionToken: string,
  lastUpdatedAt?: string | null,
): Promise<Roadmap> {
  const body: { tag_ids: string[]; last_updated_at?: string } = { tag_ids: tagIds }
  if (lastUpdatedAt) body.last_updated_at = lastUpdatedAt
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${roadmapId}/tags/order`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
    sessionToken,
  )
  return toRoadmap(data)
}

/**
 * Import phases from RoadForge JSON. Runs client-side.
 */
