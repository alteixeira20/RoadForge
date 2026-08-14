import type { Phase } from '@/types/roadmap'
import { requestJson } from './roadmap-http'

interface ApiStructureMutationResponse {
  id: string
  name: string
  phases: Phase[]
  updated_at: string
}

export interface StructureMutationResult {
  roadmapName: string
  phases: Phase[]
  updatedAt: string
}

export type PatchPhaseFields = Partial<Pick<Phase, 'name' | 'color' | 'colorMode'>>

function toStructureMutationResult(
  response: ApiStructureMutationResponse,
): StructureMutationResult {
  return {
    roadmapName: response.name,
    phases: response.phases,
    updatedAt: response.updated_at,
  }
}

export async function patchRoadmapName(
  roadmapId: string,
  name: string,
  sessionToken: string,
): Promise<StructureMutationResult> {
  const response = await requestJson<ApiStructureMutationResponse>(
    `/api/roadmaps/${roadmapId}/name`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    },
    sessionToken,
  )
  return toStructureMutationResult(response)
}

export async function patchPhaseFields(
  roadmapId: string,
  phaseId: string,
  updates: PatchPhaseFields,
  sessionToken: string,
): Promise<StructureMutationResult> {
  const response = await requestJson<ApiStructureMutationResponse>(
    `/api/roadmaps/${roadmapId}/phases/${encodeURIComponent(phaseId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
    sessionToken,
  )
  return toStructureMutationResult(response)
}
