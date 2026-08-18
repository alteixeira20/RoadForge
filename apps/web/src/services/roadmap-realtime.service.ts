// ─── Realtime / SSE service ─────────────────────────────────────────────────────
// SSE ticket acquisition, event stream subscription, and activity log fetching.

import type { ActivityLogList } from '@/types/roadmap'
import { API_BASE_URL, requestJson } from './roadmap-http'

// ─── Realtime handler types ────────────────────────────────────────────────────

export type RealtimePhaseOperation = 'created' | 'deleted' | 'reordered'
export type RealtimeTaskOperation = 'created' | 'deleted' | 'reordered'

export interface RoadmapUpdatedEventPayload {
  roadmap_id: string
  updated_at: string
  participant_id: string
  task_id?: string
  task_ids?: string[]
  task_operation?: RealtimeTaskOperation
  phase_id?: string
  parent_id?: string | null
  dependency_id?: string
  phase_operation?: RealtimePhaseOperation
  phase_ids?: string[]
  action?: string
  changed_fields?: string[]
  roadmap_fields?: string[]
}

export interface RealtimeHandlers {
  onOpen?: () => void
  onUpdated?: (payload: RoadmapUpdatedEventPayload) => void
  onLockAcquired?: (payload: { roadmap_id: string; target: string; participant_id: string; display_name: string }) => void
  onLockReleased?: (payload: { roadmap_id: string; target: string; participant_id: string }) => void
  onParticipantRevoked?: (payload: { roadmap_id: string; participant_id: string; revoked_at: string }) => void
  onRoadmapDeleted?: (payload: { roadmap_id: string; updated_at: string; participant_id: string }) => void
  onError?: (err: Event) => void
}

// ─── SSE ticket ────────────────────────────────────────────────────────────────

/**
 * Request a short-lived ticket to open an SSE stream.
 */
export async function getEventTicket(
  roadmapId: string,
  sessionToken: string,
): Promise<{ expires_in: number }> {
  return await requestJson<{ expires_in: number }>(
    `/api/roadmaps/${roadmapId}/events/ticket`,
    { method: 'POST', credentials: 'include' },
    sessionToken,
  )
}

// ─── SSE stream ────────────────────────────────────────────────────────────────

/**
 * Subscribe to roadmap events via SSE.
 * Returns a function to unsubscribe (close the stream).
 */
export function subscribeToRoadmapEvents(
  roadmapId: string,
  handlers: RealtimeHandlers,
): () => void {
  const url = `${API_BASE_URL}/api/roadmaps/${encodeURIComponent(roadmapId)}/events`
  const es = new EventSource(url, { withCredentials: true })

  es.onopen = () => {
    handlers.onOpen?.()
  }

  es.addEventListener('roadmap.updated', (e) => {
    try {
      const data = JSON.parse(e.data)
      handlers.onUpdated?.(data)
    } catch (err) {
      console.error('Failed to parse roadmap.updated event', err)
    }
  })

  es.addEventListener('lock.acquired', (e) => {
    try {
      const data = JSON.parse(e.data)
      handlers.onLockAcquired?.(data)
    } catch (err) {
      console.error('Failed to parse lock.acquired event', err)
    }
  })

  es.addEventListener('lock.released', (e) => {
    try {
      const data = JSON.parse(e.data)
      handlers.onLockReleased?.(data)
    } catch (err) {
      console.error('Failed to parse lock.released event', err)
    }
  })

  es.addEventListener('participant.revoked', (e) => {
    try {
      const data = JSON.parse(e.data)
      handlers.onParticipantRevoked?.(data)
    } catch (err) {
      console.error('Failed to parse participant.revoked event', err)
    }
  })

  es.addEventListener('roadmap.deleted', (e) => {
    try {
      const data = JSON.parse(e.data)
      handlers.onRoadmapDeleted?.(data)
    } catch (err) {
      console.error('Failed to parse roadmap.deleted event', err)
    }
  })

  es.onerror = (err) => {
    handlers.onError?.(err)
  }

  return () => es.close()
}

// ─── Activity log ──────────────────────────────────────────────────────────────

/**
 * Fetch activity logs for a roadmap.
 */
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
