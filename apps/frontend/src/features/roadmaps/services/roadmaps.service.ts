import type { Roadmap, Phase, TagDefinition, ChangeSummary } from '@/shared/types/roadmap'
import { requestJson, resolveBrowserSessionToken } from '@/shared/http/roadmap-http'
import { toRoadmap, type ApiRoadmapResponse } from '@/shared/http/roadmap-response'

interface ApiCreateRoadmapResponse extends ApiRoadmapResponse {
  owner_participant_id: string
  owner_session_token: string
}

export async function createRoadmap(
  name: string,
  ownerDisplayName: string,
  phases: Phase[] = [],
  tagRegistry?: TagDefinition[],
  password?: string,
  changeSummary?: ChangeSummary | null,
): Promise<{
  roadmap: Roadmap
  ownerParticipantId: string
  ownerSessionToken: string
}> {
  const body: Record<string, unknown> = { name, owner_display_name: ownerDisplayName, phases }
  if (tagRegistry && tagRegistry.length > 0) body.tag_registry = tagRegistry
  if (password) body.password = password
  if (changeSummary) body.change_summary = changeSummary
  const data = await requestJson<ApiCreateRoadmapResponse>('/api/roadmaps', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const browserSessionToken = await resolveBrowserSessionToken(
    data.id,
    data.owner_session_token,
  )
  return {
    roadmap: toRoadmap(data),
    ownerParticipantId: data.owner_participant_id,
    ownerSessionToken: browserSessionToken,
  }
}

/**
 * Load a roadmap by ID.
 */
export async function getRoadmap(
  id: string,
  sessionToken?: string,
  options?: { signal?: AbortSignal },
): Promise<Roadmap> {
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${id}`,
    { signal: options?.signal },
    sessionToken,
  )
  return toRoadmap(data)
}

export async function deleteRoadmap(
  roadmapId: string,
  sessionToken: string,
): Promise<{ ok: boolean }> {
  return await requestJson<{ ok: boolean }>(
    `/api/roadmaps/${roadmapId}`,
    { method: 'DELETE' },
    sessionToken,
  )
}

/**
 * Push a local roadmap snapshot to the server (full snapshot replace for phases).
 */
export async function saveToServer(
  roadmapId: string,
  name: string,
  phases: Phase[],
  sessionToken: string,
  lastUpdatedAt: string,
  changeSummary?: ChangeSummary | null,
  tagRegistry?: TagDefinition[],
): Promise<ApiRoadmapResponse> {
  const body: Record<string, unknown> = {}
  body.name = name
  body.phases = phases
  body.last_updated_at = lastUpdatedAt
  if (tagRegistry !== undefined) body.tag_registry = tagRegistry
  if (changeSummary) body.change_summary = changeSummary
  return await requestJson<ApiRoadmapResponse>(`/api/roadmaps/${roadmapId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }, sessionToken)
}

interface ApiJoinResponse {
  roadmap_id: string
  roadmap_name: string
  role: string
  session_token: string
  participant_id: string
}

export async function joinRoadmap(
  token: string,
  displayName?: string,
  password?: string,
): Promise<{ roadmapId: string; roadmapName: string; role: string; sessionToken: string; participantId: string }> {
  const body: Record<string, unknown> = { token }
  if (displayName) body.display_name = displayName
  if (password) body.password = password
  const data = await requestJson<ApiJoinResponse>('/api/roadmaps/join', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const browserSessionToken = await resolveBrowserSessionToken(
    data.roadmap_id,
    data.session_token,
  )
  return {
    roadmapId: data.roadmap_id,
    roadmapName: data.roadmap_name,
    role: data.role,
    sessionToken: browserSessionToken,
    participantId: data.participant_id,
  }
}

interface ApiRoadmapNameMutationResponse {
  name: string
  updated_at: string
}

export interface RoadmapNameMutationResult {
  roadmapName: string
  updatedAt: string
}

export async function patchRoadmapName(
  roadmapId: string,
  name: string,
  sessionToken: string,
): Promise<RoadmapNameMutationResult> {
  const response = await requestJson<ApiRoadmapNameMutationResponse>(
    `/api/roadmaps/${roadmapId}/name`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    },
    sessionToken,
  )
  return {
    roadmapName: response.name,
    updatedAt: response.updated_at,
  }
}
