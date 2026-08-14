import type { Phase } from '@/types/roadmap'
import { requestJson } from './roadmap-http'

interface ApiPhaseMutationResponse {
  phases: Phase[]
  updated_at: string
}

export interface PhaseMutationResult {
  phases: Phase[]
  updatedAt: string
}

export type PatchPhaseFields = Partial<Pick<Phase, 'name' | 'color' | 'colorMode'>>

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
