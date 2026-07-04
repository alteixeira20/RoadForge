import {
  ApiError,
  getConflictMetadata,
  isApiConnectionError,
  isSessionExpiredError,
} from '@/services/roadmap-http'
import type { RoadmapConflictMetadata } from '@/types/roadmap'

export type RoadmapSaveErrorKind =
  | 'conflict'
  | 'session-expired'
  | 'unauthorized'
  | 'forbidden'
  | 'connection'
  | 'unknown'

export interface RoadmapSaveError {
  kind: RoadmapSaveErrorKind
  status: number | null
  conflictMetadata: RoadmapConflictMetadata | null
  hasLegacyConflictStatus: boolean
}

export function getRoadmapErrorStatus(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null
}

export function getRoadmapConflictPayload(
  error: unknown,
): RoadmapConflictMetadata | null {
  return getConflictMetadata(error)
}

export function isRoadmapConflictError(error: unknown): boolean {
  return getRoadmapErrorStatus(error) === 409
}

export function isRoadmapSessionExpiredError(error: unknown): boolean {
  return isSessionExpiredError(error)
}

export function classifyRoadmapSaveError(error: unknown): RoadmapSaveError {
  const status = getRoadmapErrorStatus(error)
  const conflictMetadata = getRoadmapConflictPayload(error)
  const hasLegacyConflictStatus = (
    error instanceof Error && error.message.includes('409')
  )

  return {
    kind: getRoadmapSaveErrorKind(error, status),
    status,
    conflictMetadata,
    hasLegacyConflictStatus,
  }
}

function getRoadmapSaveErrorKind(
  error: unknown,
  status: number | null,
): RoadmapSaveErrorKind {
  if (isRoadmapConflictError(error)) return 'conflict'
  if (isRoadmapSessionExpiredError(error)) return 'session-expired'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (isApiConnectionError(error)) return 'connection'
  return 'unknown'
}
