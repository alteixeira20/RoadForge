import {
  ApiError,
  getConflictMetadata,
  isApiConnectionError,
  isSessionExpiredError,
  type ApiValidationDetail,
} from '@/services/roadmap-http'
import type { RoadmapConflictMetadata } from '@/types/roadmap'

export type RoadmapSaveErrorKind =
  | 'conflict'
  | 'session-expired'
  | 'unauthorized'
  | 'forbidden'
  | 'validation'
  | 'connection'
  | 'unknown'

export interface RoadmapSaveError {
  kind: RoadmapSaveErrorKind
  status: number | null
  conflictMetadata: RoadmapConflictMetadata | null
  hasLegacyConflictStatus: boolean
  validationMessage: string | null
}

function getRoadmapValidationErrors(error: unknown): ApiValidationDetail[] | null {
  if (!(error instanceof ApiError)) return null
  return error.validationErrors ?? null
}

function formatValidationLoc(loc: (string | number)[]): string {
  const segments = loc[0] === 'body' ? loc.slice(1) : loc
  return segments.reduce<string>((path, segment, index) => {
    if (typeof segment === 'number') return `${path}[${segment}]`
    return index === 0 ? `${segment}` : `${path}.${segment}`
  }, '')
}

export function formatValidationMessage(errors: ApiValidationDetail[]): string {
  const first = errors[0]
  if (!first) return 'Save rejected: the server could not validate this roadmap.'
  const path = formatValidationLoc(first.loc)
  return path ? `Save rejected: ${path} — ${first.msg}` : `Save rejected: ${first.msg}`
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
  const kind = getRoadmapSaveErrorKind(error, status)
  const validationErrors = kind === 'validation' ? getRoadmapValidationErrors(error) : null

  return {
    kind,
    status,
    conflictMetadata,
    hasLegacyConflictStatus,
    validationMessage: validationErrors ? formatValidationMessage(validationErrors) : null,
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
  // A 422 is a validation failure, never a connection problem — check this
  // before isApiConnectionError so it can never be misreported as offline.
  if (status === 422) return 'validation'
  if (isApiConnectionError(error)) return 'connection'
  return 'unknown'
}
