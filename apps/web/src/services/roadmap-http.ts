// ─── HTTP helpers ───────────────────────────────────────────────────────────────
// Shared request infrastructure used by all domain service files.
// No business logic lives here — only transport concerns.

import type { RoadmapConflictMetadata } from '@/types/roadmap'

// ─── API configuration ─────────────────────────────────────────────────────────

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7878'
).replace(/\/$/, '')

// ─── Connection error ──────────────────────────────────────────────────────────

export class ApiConnectionError extends Error {
  constructor() {
    super('Could not reach the Anvilary API.')
    this.name = 'ApiConnectionError'
  }
}

export function isApiConnectionError(error: unknown): error is ApiConnectionError {
  return error instanceof ApiConnectionError || (
    error instanceof Error && error.name === 'ApiConnectionError'
  )
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly code?: string,
    public readonly conflict?: RoadmapConflictMetadata,
  ) {
    super(`API ${status}: ${detail}`)
    this.name = 'ApiError'
  }
}

export function isApiError(error: unknown, status?: number, detail?: string): error is ApiError {
  if (!(error instanceof ApiError)) return false
  if (status !== undefined && error.status !== status) return false
  if (detail !== undefined && error.detail !== detail) return false
  return true
}

export function isSessionExpiredError(error: unknown): boolean {
  return isApiError(error, 401, 'Session expired') || isApiError(error, 401, 'Session revoked')
}

export function isAuthError(error: unknown): boolean {
  return isApiError(error, 401) || isApiError(error, 403)
}

export function isConflictError(error: unknown): boolean {
  return isApiError(error, 409)
}

export function getConflictMetadata(error: unknown): RoadmapConflictMetadata | null {
  if (!(error instanceof ApiError)) return null
  if (error.status !== 409 || error.code !== 'roadmap_conflict') return null
  return error.conflict ?? null
}

// ─── HTTP helper ───────────────────────────────────────────────────────────────

export async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  sessionToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`
  }
  let res: Response
  try {
    res = await fetch(API_BASE_URL + path, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    })
  } catch {
    throw new ApiConnectionError()
  }
  // 204 No Content — no body to parse
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    let detail = res.statusText
    let code: string | undefined
    let conflict: RoadmapConflictMetadata | undefined
    try {
      const body = await res.json() as {
        detail?: string | { detail?: string; code?: string; conflict?: RoadmapConflictMetadata }
        code?: string
        conflict?: RoadmapConflictMetadata
      }
      if (typeof body.detail === 'string') detail = body.detail
      if (typeof body.detail === 'object' && body.detail?.detail) detail = body.detail.detail
      code = body.code ?? (typeof body.detail === 'object' ? body.detail.code : undefined)
      conflict = body.conflict ?? (typeof body.detail === 'object' ? body.detail.conflict : undefined)
    } catch {
      // leave detail as statusText
    }
    throw new ApiError(res.status, detail, code, conflict)
  }
  return res.json() as Promise<T>
}
