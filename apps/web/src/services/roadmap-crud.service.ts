// ─── Roadmap CRUD service ───────────────────────────────────────────────────────
// Create / read / update / delete roadmaps, versions, checkpoints, and task state.
// Import / export helpers that run client-side are included here because they
// map directly to roadmap data structures with no domain-specific concerns.

import type { Roadmap, Phase, Task, ShareRole, ExportFormat, ChangeSummary, RoadmapVersionDetail, RoadmapVersionSummary } from '@/types/roadmap'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'
import { normalizePhasesProgress } from '@/lib/phase-progress'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import { requestJson } from './roadmap-http'

// ─── Backend response shapes (local to this file) ─────────────────────────────

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
  owner_session_token: string
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

interface ApiCheckpointResponse {
  created: boolean
  version: ApiRoadmapVersionSummaryResponse
}

export interface CheckpointResult {
  created: boolean
  version: RoadmapVersionSummary
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

/**
 * Push a local roadmap snapshot to the server (full snapshot replace for phases).
 */
export async function saveToServer(
  roadmapId: string,
  name: string,
  phases: Phase[],
  sessionToken: string,
  lastUpdatedAt: string,
  changeSummary?: ChangeSummary | null,
): Promise<ApiRoadmapResponse> {
  const body: Record<string, unknown> = {}
  body.name = name
  body.phases = phases
  body.last_updated_at = lastUpdatedAt
  if (changeSummary) body.change_summary = changeSummary
  return await requestJson<ApiRoadmapResponse>(`/api/roadmaps/${roadmapId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }, sessionToken)
}

export interface PatchTaskDoneParams {
  roadmapId: string
  taskId: string
  done: boolean
  sessionToken: string
  lastUpdatedAt: string
}

// ─── Roadmap versions ──────────────────────────────────────────────────────────

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
 * Toggle a task's done state through the first partial roadmap write endpoint.
 */
export async function patchTaskDone({
  roadmapId,
  taskId,
  done,
  sessionToken,
  lastUpdatedAt,
}: PatchTaskDoneParams): Promise<Roadmap> {
  const data = await requestJson<ApiRoadmapResponse>(
    `/api/roadmaps/${roadmapId}/tasks/${taskId}/done`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        done,
        last_updated_at: lastUpdatedAt,
      }),
    },
    sessionToken,
  )
  return toRoadmap(data)
}

/**
 * Backwards-compatible alias for older imports.
 */
export async function updateTaskDone(params: PatchTaskDoneParams): Promise<Roadmap> {
  return patchTaskDone(params)
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

function collectTagRegistry(phases: Phase[]): string[] {
  const tags = new Set<string>()
  for (const phase of phases) {
    for (const task of phase.tasks) {
      for (const tag of task.tags ?? []) tags.add(tag)
    }
  }
  return Array.from(tags).sort()
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
    meta: {
      phaseCount: phases.length,
      taskCount: phases.reduce((sum, p) => sum + p.tasks.length, 0),
    },
    tagRegistry: collectTagRegistry(phases),
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
