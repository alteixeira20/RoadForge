import type { Roadmap, Phase, TagDefinition, RoadmapVersionDetail, RoadmapVersionSummary, ActivityLogList } from '@/shared/types/roadmap'
import { requestJson } from '@/shared/http/roadmap-http'
import { toRoadmap, type ApiRoadmapResponse } from '@/shared/http/roadmap-response'

interface ApiRoadmapVersionSummaryResponse {
  id: string
  version_number: number
  created_at: string
  actor_name: string | null
  action: string | null
  phase_count: number
  task_count: number
}

interface ApiRoadmapVersionDetailResponse extends ApiRoadmapVersionSummaryResponse {
  roadmap_name: string
  phases: Phase[]
  tag_registry?: TagDefinition[] | null
  metadata_json: Record<string, unknown> | null
}

interface ApiCheckpointResponse {
  created: boolean
  version: ApiRoadmapVersionSummaryResponse
}

export interface CheckpointResult {
  created: boolean
  version: RoadmapVersionSummary
}

// ─── Mappers ───────────────────────────────────────────────────────────────────
function toRoadmapVersionSummary(r: ApiRoadmapVersionSummaryResponse): RoadmapVersionSummary {
  return {
    id: r.id,
    versionNumber: r.version_number,
    createdAt: r.created_at,
    actorName: r.actor_name,
    action: r.action,
    phaseCount: r.phase_count,
    taskCount: r.task_count,
  }
}

function toRoadmapVersionDetail(r: ApiRoadmapVersionDetailResponse): RoadmapVersionDetail {
  return {
    ...toRoadmapVersionSummary(r),
    roadmapName: r.roadmap_name,
    phases: r.phases,
    tagRegistry: r.tag_registry ?? undefined,
    metadataJson: r.metadata_json,
  }
}

/**
 * Create a new roadmap on the server. The web client exchanges the raw owner
 * Bearer token for a path-scoped HttpOnly cookie before returning to callers.
 */
export async function getRoadmapVersions(
  roadmapId: string,
  sessionToken: string,
): Promise<RoadmapVersionSummary[]> {
  const data = await requestJson<ApiRoadmapVersionSummaryResponse[]>(
    `/api/roadmaps/${roadmapId}/versions`,
    {},
    sessionToken,
  )
  return data.map(toRoadmapVersionSummary)
}

export async function getRoadmapVersion(
  roadmapId: string,
  versionId: string,
  sessionToken: string,
): Promise<RoadmapVersionDetail> {
  const data = await requestJson<ApiRoadmapVersionDetailResponse>(
    `/api/roadmaps/${roadmapId}/versions/${versionId}`,
    {},
    sessionToken,
  )
  return toRoadmapVersionDetail(data)
}

export async function restoreRoadmapVersion(
  roadmapId: string,
  versionId: string,
  sessionToken: string,
  lastUpdatedAt: string,
  force = false,
): Promise<Roadmap> {
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${roadmapId}/versions/${versionId}/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ last_updated_at: lastUpdatedAt, force }),
    },
    sessionToken,
  )
  return toRoadmap(data)
}

export async function createRoadmapCheckpoint(
  roadmapId: string,
  sessionToken: string,
): Promise<CheckpointResult> {
  const data = await requestJson<ApiCheckpointResponse>(
    `/api/roadmaps/${roadmapId}/versions/checkpoint`,
    { method: 'POST' },
    sessionToken,
  )
  return { created: data.created, version: toRoadmapVersionSummary(data.version) }
}

export async function getRoadmapActivity(
  roadmapId: string,
  sessionToken: string,
  limit: number = 100,
  offset: number = 0,
): Promise<ActivityLogList> {
  return await requestJson<ActivityLogList>(
    `/api/roadmaps/${roadmapId}/activity?limit=${limit}&offset=${offset}`,
    {},
    sessionToken,
  )
}
