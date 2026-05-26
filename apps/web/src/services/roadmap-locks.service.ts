// ─── Locks service ──────────────────────────────────────────────────────────────
// Acquire, release, and list soft edit locks.

import { requestJson } from './roadmap-http'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ApiLockResponse {
  roadmap_id: string
  target: string
  participant_id: string
  display_name: string
  expires_at: string
}

// ─── Lock operations ───────────────────────────────────────────────────────────

/**
 * Acquire or refresh a lock on a target.
 */
export async function acquireLock(
  roadmapId: string,
  target: string,
  sessionToken: string,
): Promise<ApiLockResponse> {
  return await requestJson<ApiLockResponse>(
    `/api/roadmaps/${roadmapId}/locks`,
    {
      method: 'POST',
      body: JSON.stringify({ target }),
    },
    sessionToken,
  )
}

/**
 * Explicitly release a lock.
 */
export async function releaseLock(
  roadmapId: string,
  target: string,
  sessionToken: string,
): Promise<void> {
  await requestJson<void>(
    `/api/roadmaps/${roadmapId}/locks/${target}`,
    { method: 'DELETE' },
    sessionToken,
  )
}

/**
 * Fetch all active locks for a roadmap.
 */
export async function getLocks(
  roadmapId: string,
  sessionToken: string,
): Promise<ApiLockResponse[]> {
  return await requestJson<ApiLockResponse[]>(
    `/api/roadmaps/${roadmapId}/locks`,
    {},
    sessionToken,
  )
}
