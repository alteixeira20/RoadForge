// ─── Roadmap service ───────────────────────────────────────────────────────────
// Single point where frontend code talks to the backend API.
// All fetch() calls live here — no other file should call fetch() directly.
//
// Local-first model: localStorage is kept as optimistic cache.
// When a backend call succeeds the caller is responsible for syncing context/storage.

import type { Roadmap, Phase, Task, ShareLink, ShareRole, ExportFormat, ActivityLogList, ChangeSummary, Participant, RoadmapVersionDetail, RoadmapVersionSummary } from '@/types/roadmap'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'

// ─── API configuration ─────────────────────────────────────────────────────────

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:7878'
).replace(/\/$/, '')

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

async function requestJson<T>(
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

// ─── Backend response shapes (snake_case, local to this file) ─────────────────

interface ApiRoadmapResponse {
  id: string
  name: string
  owner_display_name: string
  schema_version: string
  phases: Phase[]
  is_password_enabled: boolean
  created_at: string
  updated_at: string
}

interface ApiCreateRoadmapResponse extends ApiRoadmapResponse {
  share_links: ApiShareLinkResponse[]
  owner_session_token: string
}

interface ApiShareLinkResponse {
  id: string | null
  role: string
  token_prefix: string | null
  url: string | null
  is_active: boolean
  created_at: string | null
  rotated_at: string | null
}

interface ApiParticipantResponse {
  id: string
  display_name: string
  role: string
  created_at: string
  last_seen_at: string | null
  revoked_at: string | null
  is_current_participant: boolean
  share_link_id: string | null
  joined_via_role: string | null
  access_source_label: string
}

interface ApiRoadmapVersionSummaryResponse {
  id: string
  version_number: number
  created_at: string
  actor_name: string | null
  action: string | null
  phase_count: number
  task_count: number
}

interface ApiRoadmapVersionDetailResponse extends ApiRoadmapVersionSummaryResponse {
  roadmap_name: string
  phases: Phase[]
  metadata_json: Record<string, unknown> | null
}

interface ApiJoinResponse {
  roadmap_id: string
  roadmap_name: string
  role: string
  session_token: string
  participant_id: string
}

export interface ApiLockResponse {
  roadmap_id: string
  target: string
  participant_id: string
  display_name: string
  expires_at: string
}

export interface RealtimeHandlers {
  onUpdated?: (payload: { roadmap_id: string; updated_at: string; participant_id: string }) => void
  onLockAcquired?: (payload: { roadmap_id: string; target: string; participant_id: string; display_name: string }) => void
  onLockReleased?: (payload: { roadmap_id: string; target: string; participant_id: string }) => void
  onParticipantRevoked?: (payload: { roadmap_id: string; participant_id: string; revoked_at: string }) => void
  onRoadmapDeleted?: (payload: { roadmap_id: string; updated_at: string; participant_id: string }) => void
  onError?: (err: Event) => void
}

// ─── Mappers ───────────────────────────────────────────────────────────────────

function toRoadmap(r: ApiRoadmapResponse): Roadmap {
  return {
    project: { id: r.id, name: r.name },
    roadmap: { id: r.id, name: r.name, isPasswordEnabled: r.is_password_enabled },
    phases: r.phases,
    ownerDisplayName: r.owner_display_name,
    updatedAt: r.updated_at,
  }
}

// Matches icon/desc/recommended from MOCK_SHARE_LINKS in sample-roadmap.ts.
const _LINK_META: Record<string, { icon: string; desc: string; recommended?: true }> = {
  owner:  { icon: 'shield', desc: 'Full control — manage settings, links, and members.' },
  editor: { icon: 'users',  desc: 'Can edit phases, tasks, and dependencies. Cannot delete the roadmap.', recommended: true },
  viewer: { icon: 'circle', desc: 'Anyone with this link can view this roadmap read-only. Good for public demos.' },
}

function toShareLink(r: ApiShareLinkResponse): ShareLink {
  const meta = _LINK_META[r.role] ?? { icon: 'link', desc: r.role }
  return {
    id: r.id,
    role: r.role as ShareRole,
    icon: meta.icon,
    desc: meta.desc,
    url: r.url ?? '',
    isActive: r.is_active,
    tokenPrefix: r.token_prefix,
    createdAt: r.created_at,
    rotatedAt: r.rotated_at,
    ...(meta.recommended ? { recommended: true } : {}),
  }
}

function toParticipant(r: ApiParticipantResponse): Participant {
  return {
    id: r.id,
    displayName: r.display_name,
    role: r.role as ShareRole,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
    isCurrentParticipant: r.is_current_participant,
    shareLinkId: r.share_link_id ?? null,
    joinedViaRole: (r.joined_via_role ?? null) as ShareRole | null,
    accessSourceLabel: r.access_source_label ?? 'Legacy / unknown link',
  }
}

function toRoadmapVersionSummary(r: ApiRoadmapVersionSummaryResponse): RoadmapVersionSummary {
  return {
    id: r.id,
    versionNumber: r.version_number,
    createdAt: r.created_at,
    actorName: r.actor_name,
    action: r.action,
    phaseCount: r.phase_count,
    taskCount: r.task_count,
  }
}

function toRoadmapVersionDetail(r: ApiRoadmapVersionDetailResponse): RoadmapVersionDetail {
  return {
    ...toRoadmapVersionSummary(r),
    roadmapName: r.roadmap_name,
    phases: r.phases,
    metadataJson: r.metadata_json,
  }
}

// ─── Roadmap CRUD ──────────────────────────────────────────────────────────────

/**
 * Create a new roadmap on the server.
 */
export async function createRoadmap(
  name: string,
  ownerDisplayName: string,
  phases: Phase[] = [],
  password?: string,
  changeSummary?: ChangeSummary | null,
): Promise<{ roadmap: Roadmap; ownerSessionToken: string }> {
  const body: Record<string, unknown> = { name, owner_display_name: ownerDisplayName, phases }
  if (password) body.password = password
  if (changeSummary) body.change_summary = changeSummary
  const data = await requestJson<ApiCreateRoadmapResponse>('/api/roadmaps', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return { roadmap: toRoadmap(data), ownerSessionToken: data.owner_session_token }
}

/**
 * Load a roadmap by ID.
 */
export async function getRoadmap(id: string, sessionToken?: string): Promise<Roadmap> {
  const data = await requestJson<ApiRoadmapResponse>(`/api/roadmaps/${id}`, {}, sessionToken)
  return toRoadmap(data)
}

export async function deleteRoadmap(
  roadmapId: string,
  sessionToken: string,
): Promise<{ ok: boolean }> {
  return await requestJson<{ ok: boolean }>(
    `/api/roadmaps/${roadmapId}`,
    { method: 'DELETE' },
    sessionToken,
  )
}

// ─── Roadmap versions ─────────────────────────────────────────────────────────

export async function getRoadmapVersions(
  roadmapId: string,
  sessionToken: string,
): Promise<RoadmapVersionSummary[]> {
  const data = await requestJson<ApiRoadmapVersionSummaryResponse[]>(
    `/api/roadmaps/${roadmapId}/versions`,
    {},
    sessionToken,
  )
  return data.map(toRoadmapVersionSummary)
}

export async function getRoadmapVersion(
  roadmapId: string,
  versionId: string,
  sessionToken: string,
): Promise<RoadmapVersionDetail> {
  const data = await requestJson<ApiRoadmapVersionDetailResponse>(
    `/api/roadmaps/${roadmapId}/versions/${versionId}`,
    {},
    sessionToken,
  )
  return toRoadmapVersionDetail(data)
}

export async function restoreRoadmapVersion(
  roadmapId: string,
  versionId: string,
  sessionToken: string,
): Promise<Roadmap> {
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${roadmapId}/versions/${versionId}/restore`,
    { method: 'POST' },
    sessionToken,
  )
  return toRoadmap(data)
}

interface ApiCheckpointResponse {
  created: boolean
  version: ApiRoadmapVersionSummaryResponse
}

export interface CheckpointResult {
  created: boolean
  version: RoadmapVersionSummary
}

export async function createRoadmapCheckpoint(
  roadmapId: string,
  sessionToken: string,
): Promise<CheckpointResult> {
  const data = await requestJson<ApiCheckpointResponse>(
    `/api/roadmaps/${roadmapId}/versions/checkpoint`,
    { method: 'POST' },
    sessionToken,
  )
  return { created: data.created, version: toRoadmapVersionSummary(data.version) }
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
 */
export async function saveToServer(
  roadmapId: string,
  name?: string,
  phases?: Phase[],
  sessionToken?: string,
  lastUpdatedAt?: string,
  changeSummary?: ChangeSummary | null,
): Promise<ApiRoadmapResponse> {
  const body: Record<string, unknown> = {}
  if (name !== undefined) body.name = name
  if (phases !== undefined) body.phases = phases
  if (lastUpdatedAt !== undefined) body.last_updated_at = lastUpdatedAt
  if (changeSummary) body.change_summary = changeSummary
  return await requestJson<ApiRoadmapResponse>(`/api/roadmaps/${roadmapId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }, sessionToken)
}

// ─── Realtime / SSE ────────────────────────────────────────────────────────────

/**
 * Request a short-lived ticket to open an SSE stream.
 */
export async function getEventTicket(
  roadmapId: string,
  sessionToken: string,
): Promise<{ ticket: string; expires_in: number }> {
  return await requestJson<{ ticket: string; expires_in: number }>(
    `/api/roadmaps/${roadmapId}/events/ticket`,
    { method: 'POST' },
    sessionToken,
  )
}

/**
 * Subscribe to roadmap events via SSE.
 * Returns a function to unsubscribe (close the stream).
 */
export function subscribeToRoadmapEvents(
  roadmapId: string,
  ticket: string,
  handlers: RealtimeHandlers,
): () => void {
  const url = `${API_BASE_URL}/api/roadmaps/${roadmapId}/events?ticket=${ticket}`
  const es = new EventSource(url)

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

// ─── Soft locks ────────────────────────────────────────────────────────────────

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


// ─── Share links ───────────────────────────────────────────────────────────────

/**
 * Fetch share-link states for all roles on a roadmap.
 * url is empty string when null — raw tokens are not re-exposed after creation.
 */
export async function getShareLinks(roadmapId: string, sessionToken: string): Promise<ShareLink[]> {
  const data = await requestJson<ApiShareLinkResponse[]>(
    `/api/roadmaps/${roadmapId}/share-links`,
    {},
    sessionToken,
  )
  return data.map(toShareLink)
}

/**
 * Rotate a share link for the given role. Returns the link with the new join URL
 * (the raw token is only available in this response).
 */
export async function regenerateShareLink(
  roadmapId: string,
  role: string,
  sessionToken?: string,
): Promise<ShareLink> {
  const data = await requestJson<ApiShareLinkResponse>(
    `/api/roadmaps/${roadmapId}/share-links/${role}/rotate`,
    { method: 'POST' },
    sessionToken,
  )
  return toShareLink(data)
}

/**
 * Revoke a share link so it can no longer be used to join.
 */
export async function revokeShareLink(
  roadmapId: string,
  role: string,
  sessionToken?: string,
): Promise<void> {
  await requestJson<void>(
    `/api/roadmaps/${roadmapId}/share-links/${role}`,
    { method: 'DELETE' },
    sessionToken,
  )
}

// ─── Participants ─────────────────────────────────────────────────────────────

/**
 * Fetch joined participant sessions for owner management.
 */
export async function getParticipants(
  roadmapId: string,
  sessionToken: string,
): Promise<Participant[]> {
  const data = await requestJson<ApiParticipantResponse[]>(
    `/api/roadmaps/${roadmapId}/participants`,
    {},
    sessionToken,
  )
  return data.map(toParticipant)
}

/**
 * Revoke a joined participant session. This does not revoke invite links.
 */
export async function revokeParticipant(
  roadmapId: string,
  participantId: string,
  sessionToken: string,
): Promise<void> {
  await requestJson<void>(
    `/api/roadmaps/${roadmapId}/participants/${participantId}/revoke`,
    { method: 'POST' },
    sessionToken,
  )
}

// ─── Import / Export ───────────────────────────────────────────────────────────

/**
 * Export the roadmap as a downloadable blob.
 * Portable roadmap-only formats run client-side.
 */
export async function exportRoadmap(
  phases: Phase[],
  format: ExportFormat,
  metadata: {
    roadmapName?: string
    ownerDisplayName?: string | null
    updatedAt?: string | null
    saved?: boolean
    serverRoadmapId?: string | null
    role?: ShareRole | null
  } = {},
): Promise<Blob> {
  const upgraded = upgradeRoadmapSnapshot({ roadmapName: metadata.roadmapName, phases })
  const json = JSON.stringify(buildRoadmapExport(normalizePhasesProgress(upgraded.phases), metadata), null, 2)
  return new Blob([json], { type: 'application/json' })
}

function buildRoadmapExport(
  phases: Phase[],
  metadata: {
    roadmapName?: string
    ownerDisplayName?: string | null
    updatedAt?: string | null
    saved?: boolean
    serverRoadmapId?: string | null
    role?: ShareRole | null
  },
) {
  return {
    schema: 'roadforge.roadmap.export',
    version: 1,
    exportedAt: new Date().toISOString(),
    roadmap: {
      name: metadata.roadmapName || 'Untitled Roadmap',
      saved: !!metadata.saved,
      id: metadata.serverRoadmapId ?? null,
      updatedAt: metadata.updatedAt ?? null,
    },
    collaborator: {
      role: metadata.role ?? null,
      ownerDisplayName: metadata.ownerDisplayName ?? null,
    },
    phases,
  }
}

/**
 * Import phases from RoadForge JSON. Runs client-side.
 */
export async function importRoadmap(
  data: string,
  _format: 'json',
): Promise<Phase[]> {
  const imported = parseImportedRoadmapJson(data)
  return upgradeRoadmapSnapshot({ roadmapName: imported.roadmapName, phases: imported.phases }).phases
}

// ─── Invite / join ─────────────────────────────────────────────────────────────

/**
 * Accept a share-link invite and join the roadmap.
 * display_name is optional — backend assigns a role-based default if omitted.
 * password is required when the roadmap has password protection enabled.
 */
export async function joinRoadmap(
  token: string,
  displayName?: string,
  password?: string,
): Promise<{ roadmapId: string; roadmapName: string; role: string; sessionToken: string; participantId: string }> {
  const body: Record<string, unknown> = { token }
  if (displayName) body.display_name = displayName
  if (password) body.password = password
  const data = await requestJson<ApiJoinResponse>('/api/roadmaps/join', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return {
    roadmapId: data.roadmap_id,
    roadmapName: data.roadmap_name,
    role: data.role,
    sessionToken: data.session_token,
    participantId: data.participant_id,
  }
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
 * Note: Current UI uses full-snapshot save; granular endpoints are deferred.
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
 * Note: Current UI uses full-snapshot save; granular endpoints are deferred.
 * TODO(backend): PATCH /api/roadmaps/:id/tasks/:taskId  { deps }
 */
export async function linkDependency(
  _roadmapId: string,
  _taskId: string,
  _depId: string,
): Promise<void> {
  throw new Error('Not implemented — requires backend')
}
