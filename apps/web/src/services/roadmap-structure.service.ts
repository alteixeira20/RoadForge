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
export type CreatePhaseFields = Pick<Phase, 'id' | 'name' | 'color' | 'colorMode'>

function toPhaseMutationResult(response: ApiPhaseMutationResponse): PhaseMutationResult {
  return {
    phases: response.phases,
    updatedAt: response.updated_at,
  }
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

export async function createServerPhase(
  roadmapId: string,
  phase: CreatePhaseFields,
  sessionToken: string,
): Promise<PhaseMutationResult> {
  // Explicitly pick only the four fields permitted by the server's
  // CreatePhaseRequest schema (extra="forbid"). The caller may pass a full
  // Phase object whose structural subtype satisfies CreatePhaseFields; blindly
  // serializing it would include num, tasks, progress, and status, which the
  // backend rejects with HTTP 422.
  const payload = {
    id: phase.id,
    name: phase.name,
    color: phase.color,
    colorMode: phase.colorMode,
  }
  const response = await requestJson<ApiPhaseMutationResponse>(
    `/api/roadmaps/${roadmapId}/phases`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    sessionToken,
  )
  return toPhaseMutationResult(response)
}

export async function reorderServerPhases(
  roadmapId: string,
  phaseIds: string[],
  sessionToken: string,
): Promise<PhaseMutationResult> {
  const response = await requestJson<ApiPhaseMutationResponse>(
    `/api/roadmaps/${roadmapId}/phases/order`,
    {
      method: 'PUT',
      body: JSON.stringify({ phase_ids: phaseIds }),
    },
    sessionToken,
  )
  return toPhaseMutationResult(response)
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
  return toPhaseMutationResult(response)
}

export async function deleteServerPhase(
  roadmapId: string,
  phaseId: string,
  sessionToken: string,
): Promise<PhaseMutationResult> {
  const response = await requestJson<ApiPhaseMutationResponse>(
    `/api/roadmaps/${roadmapId}/phases/${encodeURIComponent(phaseId)}`,
    { method: 'DELETE' },
    sessionToken,
  )
  return toPhaseMutationResult(response)
}
