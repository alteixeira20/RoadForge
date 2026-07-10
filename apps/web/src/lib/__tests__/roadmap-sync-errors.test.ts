import { describe, expect, it } from 'vitest'
import {
  classifyRoadmapSaveError,
  formatValidationMessage,
  getRoadmapConflictPayload,
  getRoadmapErrorStatus,
  isRoadmapConflictError,
  isRoadmapSessionExpiredError,
} from '@/lib/roadmap-sync-errors'
import { ApiConnectionError, ApiError, type ApiValidationDetail } from '@/services/roadmap-http'
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
      validationMessage: null,
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

  it('classifies a 422 FastAPI validation error as validation, never as connection', () => {
    const validationErrors: ApiValidationDetail[] = [
      {
        loc: ['body', 'phases', 8, 'tasks', 4, 'desc'],
        msg: 'String should have at most 5000 characters',
        type: 'string_too_long',
      },
    ]
    const error = new ApiError(422, 'Unprocessable Entity', undefined, undefined, validationErrors)
    const classified = classifyRoadmapSaveError(error)

    expect(classified.kind).toBe('validation')
    expect(classified.kind).not.toBe('connection')
    expect(classified.validationMessage).toBe(
      'Save rejected: phases[8].tasks[4].desc — String should have at most 5000 characters',
    )
  })

  it('formats a validation message path from a FastAPI loc array', () => {
    expect(formatValidationMessage([
      { loc: ['body', 'phases', 0, 'tasks', 0, 'done'], msg: 'Input should be a valid boolean', type: 'bool_type' },
    ])).toBe('Save rejected: phases[0].tasks[0].done — Input should be a valid boolean')
  })

  it('still classifies a genuine network failure as a connection error', () => {
    const classified = classifyRoadmapSaveError(new ApiConnectionError())

    expect(classified.kind).toBe('connection')
    expect(classified.kind).not.toBe('validation')
    expect(classified.validationMessage).toBeNull()
  })
})
