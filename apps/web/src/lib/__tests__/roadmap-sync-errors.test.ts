import { describe, expect, it } from 'vitest'
import {
  classifyRoadmapSaveError,
  getRoadmapConflictPayload,
  getRoadmapErrorStatus,
  isRoadmapConflictError,
  isRoadmapSessionExpiredError,
} from '@/lib/roadmap-sync-errors'
import { ApiConnectionError, ApiError } from '@/services/roadmap-http'
import type { RoadmapConflictMetadata } from '@/types/roadmap'

const conflictMetadata: RoadmapConflictMetadata = {
  roadmap_id: 'rm_1',
  server_updated_at: '2026-07-04T10:01:00Z',
  client_last_updated_at: '2026-07-04T10:00:00Z',
  server: {
    name: 'Server roadmap',
    phases: [],
  },
  summary: {
    phase_count: 0,
    task_count: 0,
  },
}

describe('roadmap sync error classification', () => {
  it('preserves structured 409 conflict metadata', () => {
    const error = new ApiError(
      409,
      'Roadmap was updated by another session',
      'roadmap_conflict',
      conflictMetadata,
    )

    expect(classifyRoadmapSaveError(error)).toEqual({
      kind: 'conflict',
      status: 409,
      conflictMetadata,
      hasLegacyConflictStatus: true,
    })
    expect(getRoadmapConflictPayload(error)).toBe(conflictMetadata)
    expect(isRoadmapConflictError(error)).toBe(true)
  })

  it.each(['Session expired', 'Session revoked'])(
    'classifies exact 401 %s errors as session expiry',
    (detail) => {
      const error = new ApiError(401, detail)

      expect(classifyRoadmapSaveError(error).kind).toBe('session-expired')
      expect(isRoadmapSessionExpiredError(error)).toBe(true)
    },
  )

  it('keeps generic auth failures distinct', () => {
    expect(classifyRoadmapSaveError(new ApiError(401, 'Unauthorized')).kind)
      .toBe('unauthorized')
    expect(classifyRoadmapSaveError(new ApiError(403, 'Forbidden')).kind)
      .toBe('forbidden')
  })

  it('classifies connection and unknown errors', () => {
    expect(classifyRoadmapSaveError(new ApiConnectionError()).kind)
      .toBe('connection')
    expect(classifyRoadmapSaveError(new Error('Save failed')).kind)
      .toBe('unknown')
  })

  it('reports the autosync-only legacy 409 message fallback separately', () => {
    const error = new ApiError(401, 'Request failed with status 409')
    const classified = classifyRoadmapSaveError(error)

    expect(classified.kind).toBe('unauthorized')
    expect(classified.hasLegacyConflictStatus).toBe(true)
    expect(getRoadmapErrorStatus(error)).toBe(401)
  })
})
