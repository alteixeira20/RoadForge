// ─── HTTP helpers ───────────────────────────────────────────────────────────────
// Shared request infrastructure used by all domain service files.
// No business logic lives here — only transport concerns.

// ─── API configuration ─────────────────────────────────────────────────────────

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7878'
).replace(/\/$/, '')

// ─── Connection error ──────────────────────────────────────────────────────────

export class ApiConnectionError extends Error {
  constructor() {
    super('Could not reach the RoadForge API.')
    this.name = 'ApiConnectionError'
  }
}

export function isApiConnectionError(error: unknown): error is ApiConnectionError {
  return error instanceof ApiConnectionError || (
    error instanceof Error && error.name === 'ApiConnectionError'
  )
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
    try {
      const body = await res.json() as { detail?: string }
      if (body.detail) detail = String(body.detail)
    } catch {
      // leave detail as statusText
    }
    throw new Error(`API ${res.status}: ${detail}`)
  }
  return res.json() as Promise<T>
}
