import { storage } from '@/lib/storage'
import type { ShareRole } from '@/types/roadmap'

export interface JoinResult {
  roadmapId: string
  roadmapName: string
  role: ShareRole
  sessionToken: string
  participantId: string
}

/**
 * Writes the minimal storage entries needed immediately after a successful
 * joinRoadmap() call, before any follow-up getRoadmap fetch or navigation.
 *
 * Both JoinPage and RoadmapSwitcher perform these four writes in this exact
 * order. Everything that differs between the two callers (context setters,
 * upgradeRoadmapSnapshot, navigation, UI resets) is kept in the callers.
 */
export function persistJoinResult(result: JoinResult): void {
  const { roadmapId, roadmapName, role, sessionToken, participantId } = result

  storage.setActiveRoadmapId(roadmapId)
  storage.setLastRoadmapId(roadmapId)
  storage.setAuthCache(roadmapId, {
    serverRoadmapId: roadmapId,
    sessionToken,
    participantId,
    role,
  })
  storage.setRoadmapCache(roadmapId, {
    roadmapName,
    phases: [],
    saved: true,
    ownerDisplayName: null,
    updatedAt: null,
    isPasswordEnabled: false,
  })
}
