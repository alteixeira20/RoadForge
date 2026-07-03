import {
  createRoadmapCheckpoint,
  type CheckpointResult,
} from '@/services/roadmap-crud.service'

type CreateCheckpoint = (
  roadmapId: string,
  sessionToken: string,
) => Promise<CheckpointResult>

interface ReplaceRoadmapOptions {
  serverRoadmapId: string | null
  sessionToken: string | null
  applyReplacement: () => void
  createCheckpoint?: CreateCheckpoint
}

export async function replaceRoadmapWithCheckpoint({
  serverRoadmapId,
  sessionToken,
  applyReplacement,
  createCheckpoint = createRoadmapCheckpoint,
}: ReplaceRoadmapOptions): Promise<void> {
  if (!serverRoadmapId) {
    applyReplacement()
    return
  }
  if (!sessionToken) {
    throw new Error('A valid server session is required to create a recovery checkpoint.')
  }

  await createCheckpoint(serverRoadmapId, sessionToken)
  applyReplacement()
}
