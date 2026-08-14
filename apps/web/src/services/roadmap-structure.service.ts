import type { Phase } from '@/types/roadmap'
import { requestJson } from './roadmap-http'

interface ApiRoadmapNameMutationResponse {
  name: string
  updated_at: string
}

interface ApiPhaseMutationResponse {
  phases: Phase[]
  updated_at: string
}

export interface RoadmapNameMutationResult {
  roadmapName: string
  updatedAt: string
}

export interface PhaseMutationResult {
  phases: Phase[]
  updatedAt: string
}

export type PatchPhaseFields = Partial<Pick<Phase, 'name' | 'color' | 'colorMode'>>

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

export async function patchPhaseFields(
  roadmapId: string,
  phaseId: string,
  updates: PatchPhaseFields,
  sessionToken: string,
): Promise<PhaseMutationResult> {
  const response = await requestJson<ApiPhaseMutationResponse>(
    `/api/roadmaps/${roadmapId}/phases/${encodeURIComponent(phaseId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
    sessionToken,
  )
  return {
    phases: response.phases,
    updatedAt: response.updated_at,
  }
}
