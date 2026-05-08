// ─── Roadmap service ───────────────────────────────────────────────────────────
// Single point where frontend code talks to the backend API.
// All fetch() calls live here — no other file should call fetch() directly.
//
// Local-first model: localStorage is kept as optimistic cache.
// When a backend call succeeds the caller is responsible for syncing context/storage.

import type { Roadmap, Phase, Task, ShareLink, ShareRole, ExportFormat } from '@/types/roadmap'

// ─── API configuration ─────────────────────────────────────────────────────────

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7878'
).replace(/\/$/, '')

// ─── HTTP helper ───────────────────────────────────────────────────────────────

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(API_BASE_URL + path, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  })
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

// ─── Backend response shapes (snake_case, local to this file) ─────────────────

interface ApiRoadmapResponse {
  id: string
  name: string
  owner_display_name: string
  schema_version: string
  phases: Phase[]
  created_at: string
  updated_at: string
}

interface ApiCreateRoadmapResponse extends ApiRoadmapResponse {
  share_links: ApiShareLinkResponse[]
  owner_session_token: string
}

interface ApiShareLinkResponse {
  id: string
  role: string
  token_prefix: string
  url: string | null
  is_active: boolean
  created_at: string
  rotated_at: string | null
}

interface ApiJoinResponse {
  roadmap_id: string
  roadmap_name: string
  role: string
  session_token: string
  participant_id: string
}

// ─── Mappers ───────────────────────────────────────────────────────────────────

function toRoadmap(r: ApiRoadmapResponse): Roadmap {
  return {
    project: { id: r.id, name: r.name },
    roadmap: { id: r.id, name: r.name },
    phases: r.phases,
  }
}

// Matches icon/desc/recommended from MOCK_SHARE_LINKS in sample-roadmap.ts.
const _LINK_META: Record<string, { icon: string; desc: string; recommended?: true }> = {
  owner:  { icon: 'shield', desc: 'Full control — manage settings, links, and members.' },
  editor: { icon: 'users',  desc: 'Can edit phases, tasks, and dependencies. Cannot delete the roadmap.', recommended: true },
  viewer: { icon: 'circle', desc: 'Can read everything but not change anything. Good for stakeholders.' },
}

function toShareLink(r: ApiShareLinkResponse): ShareLink {
  const meta = _LINK_META[r.role] ?? { icon: 'link', desc: r.role }
  return {
    id: r.id,
    role: r.role as ShareRole,
    icon: meta.icon,
    desc: meta.desc,
    url: r.url ?? '',
    ...(meta.recommended ? { recommended: true } : {}),
  }
}

// ─── Roadmap CRUD ──────────────────────────────────────────────────────────────

/**
 * Create a new roadmap on the server.
 * TODO(backend): POST /api/roadmaps
 */
export async function createRoadmap(
  name: string,
  ownerDisplayName: string,
  phases: Phase[] = [],
  password?: string,
): Promise<Roadmap> {
  const body: Record<string, unknown> = { name, owner_display_name: ownerDisplayName, phases }
  if (password) body.password = password
  const data = await requestJson<ApiCreateRoadmapResponse>('/api/roadmaps', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return toRoadmap(data)
}

/**
 * Load a roadmap by ID.
 * TODO(backend): GET /api/roadmaps/:id
 */
export async function getRoadmap(id: string): Promise<Roadmap> {
  const data = await requestJson<ApiRoadmapResponse>(`/api/roadmaps/${id}`)
  return toRoadmap(data)
}

// ─── Task mutations ────────────────────────────────────────────────────────────

/**
 * Toggle a task's done state.
 * TODO(backend): PATCH /api/roadmaps/:roadmapId/tasks/:taskId  { done }
 */
export async function updateTaskDone(
  _roadmapId: string,
  _taskId: string,
  _done: boolean,
): Promise<void> {
  // Optimistic update handled in RoadmapContext; backend endpoint not yet implemented.
}

// ─── Sync / collaboration ──────────────────────────────────────────────────────

/**
 * Push a local roadmap snapshot to the server (full snapshot replace for phases).
 * TODO(backend): PUT /api/roadmaps/:id
 */
export async function saveToServer(
  roadmapId: string,
  name?: string,
  phases?: Phase[],
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (name !== undefined) body.name = name
  if (phases !== undefined) body.phases = phases
  await requestJson<void>(`/api/roadmaps/${roadmapId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

// ─── Share links ───────────────────────────────────────────────────────────────

/**
 * Fetch all active share links for a roadmap.
 * url is empty string when null — raw tokens are not re-exposed after creation.
 * TODO(backend): GET /api/roadmaps/:id/share-links
 */
export async function getShareLinks(roadmapId: string): Promise<ShareLink[]> {
  const data = await requestJson<ApiShareLinkResponse[]>(
    `/api/roadmaps/${roadmapId}/share-links`,
  )
  return data.map(toShareLink)
}

/**
 * Rotate a share link for the given role. Returns the link with the new join URL
 * (the raw token is only available in this response).
 * TODO(backend): POST /api/roadmaps/:id/share-links/:role/rotate
 */
export async function regenerateShareLink(
  roadmapId: string,
  role: string,
): Promise<ShareLink> {
  const data = await requestJson<ApiShareLinkResponse>(
    `/api/roadmaps/${roadmapId}/share-links/${role}/rotate`,
    { method: 'POST' },
  )
  return toShareLink(data)
}

/**
 * Revoke a share link so it can no longer be used to join.
 * TODO(backend): DELETE /api/roadmaps/:id/share-links/:role
 */
export async function revokeShareLink(
  roadmapId: string,
  role: string,
): Promise<void> {
  await requestJson<void>(
    `/api/roadmaps/${roadmapId}/share-links/${role}`,
    { method: 'DELETE' },
  )
}

// ─── Import / Export ───────────────────────────────────────────────────────────

/**
 * Export the roadmap as a downloadable blob.
 * JSON export runs client-side. Other formats require a backend endpoint.
 * TODO(backend): GET /api/roadmaps/:id/export?format=markdown|pdf
 */
export async function exportRoadmap(
  phases: Phase[],
  format: ExportFormat,
): Promise<Blob> {
  if (format === 'json') {
    const json = JSON.stringify({ phases }, null, 2)
    return new Blob([json], { type: 'application/json' })
  }
  throw new Error(`Export format "${format}" requires backend`)
}

/**
 * Import phases from a JSON or Markdown payload.
 * TODO(backend): POST /api/roadmaps/import  { data, format }
 */
export async function importRoadmap(
  _data: string,
  _format: 'json' | 'markdown',
): Promise<Phase[]> {
  throw new Error('Import requires backend')
}

// ─── Invite / join ─────────────────────────────────────────────────────────────

/**
 * Accept a share-link invite and join the roadmap.
 * display_name is optional — backend assigns a role-based default if omitted.
 * password is required when the roadmap has password protection enabled.
 * TODO(backend): POST /api/roadmaps/join
 */
export async function joinRoadmap(
  token: string,
  displayName?: string,
  password?: string,
): Promise<{ roadmapId: string; role: string }> {
  const body: Record<string, unknown> = { token }
  if (displayName) body.display_name = displayName
  if (password) body.password = password
  const data = await requestJson<ApiJoinResponse>('/api/roadmaps/join', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return { roadmapId: data.roadmap_id, role: data.role }
}

// ─── Phase mutations (future) ──────────────────────────────────────────────────

/**
 * Add a new phase to the roadmap.
 * TODO(backend): POST /api/roadmaps/:id/phases
 */
export async function addPhase(_roadmapId: string, _name: string): Promise<Phase> {
  throw new Error('Not implemented — requires backend')
}

/**
 * Reorder phases.
 * TODO(backend): PATCH /api/roadmaps/:id/phases/order  { phaseIds }
 */
export async function reorderPhases(
  _roadmapId: string,
  _phaseIds: string[],
): Promise<void> {
  throw new Error('Not implemented — requires backend')
}

// ─── Task mutations (future) ───────────────────────────────────────────────────

/**
 * Add a task to a phase.
 * TODO(backend): POST /api/roadmaps/:id/phases/:phaseId/tasks
 */
export async function addTask(
  _roadmapId: string,
  _phaseId: string,
  _task: Omit<Task, 'id'>,
): Promise<Task> {
  throw new Error('Not implemented — requires backend')
}

/**
 * Link a dependency between two tasks.
 * TODO(backend): PATCH /api/roadmaps/:id/tasks/:taskId  { deps }
 */
export async function linkDependency(
  _roadmapId: string,
  _taskId: string,
  _depId: string,
): Promise<void> {
  throw new Error('Not implemented — requires backend')
}

