// ─── Roadmap service ───────────────────────────────────────────────────────────
// This module is the single point where frontend code talks to roadmap data.
//
// Currently all methods return mock/local data. When the backend is ready,
// replace each method body with a fetch() call to the corresponding API endpoint.
//
// API base URL will come from: process.env.NEXT_PUBLIC_API_URL
// No hardcoded URLs anywhere in this file.

import type { Roadmap, Phase, Task, ShareLink, ExportFormat } from '@/types/roadmap'
import { SAMPLE_ROADMAP, MOCK_SHARE_LINKS } from '@/data/sample-roadmap'

// ─── Roadmap CRUD ──────────────────────────────────────────────────────────────

/**
 * Load a roadmap by ID.
 * TODO(backend): GET /api/roadmaps/:id
 */
export async function getRoadmap(_id: string): Promise<Roadmap> {
  return structuredClone(SAMPLE_ROADMAP)
}

/**
 * Create a new roadmap.
 * TODO(backend): POST /api/roadmaps  { name, ownerDisplayName }
 */
export async function createRoadmap(name: string, _ownerDisplayName: string): Promise<Roadmap> {
  return {
    project: { id: 'new', name },
    roadmap: { id: 'rm-new', name },
    phases: structuredClone(SAMPLE_ROADMAP.phases),
  }
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
  // Optimistic update handled in RoadmapContext; backend confirms.
}

// ─── Sync / collaboration ──────────────────────────────────────────────────────

/**
 * Save the current local roadmap to the user's server.
 * Unlocks real-time collaboration and share links.
 * TODO(backend): POST /api/roadmaps/:id/save
 */
export async function saveToServer(_roadmapId: string): Promise<void> {
  // Simulate network delay in mock mode.
  await new Promise((r) => setTimeout(r, 800))
}

// ─── Share links ───────────────────────────────────────────────────────────────

/**
 * Fetch all share links for a roadmap.
 * TODO(backend): GET /api/roadmaps/:id/share-links
 */
export async function getShareLinks(_roadmapId: string): Promise<ShareLink[]> {
  return MOCK_SHARE_LINKS
}

/**
 * Regenerate a share link (rotate the token).
 * TODO(backend): POST /api/roadmaps/:id/share-links/:linkId/regenerate
 */
export async function regenerateShareLink(
  _roadmapId: string,
  _linkId: string,
): Promise<ShareLink> {
  throw new Error('Not implemented — requires backend')
}

/**
 * Revoke a share link so it can no longer be used to join.
 * TODO(backend): DELETE /api/roadmaps/:id/share-links/:linkId
 */
export async function revokeShareLink(
  _roadmapId: string,
  _linkId: string,
): Promise<void> {
  throw new Error('Not implemented — requires backend')
}

// ─── Import / Export ───────────────────────────────────────────────────────────

/**
 * Export the roadmap as a downloadable blob.
 * TODO(backend): GET /api/roadmaps/:id/export?format=json|markdown|pdf
 * For local-only JSON export, this can also run client-side.
 */
export async function exportRoadmap(
  phases: Phase[],
  format: ExportFormat,
): Promise<Blob> {
  if (format === 'json') {
    const json = JSON.stringify({ phases }, null, 2)
    return new Blob([json], { type: 'application/json' })
  }
  // TODO(backend): fetch export from server for markdown / pdf / agent-bundle
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
 * TODO(backend): POST /api/roadmaps/join  { token, displayName }
 */
export async function joinRoadmap(
  _token: string,
  _displayName: string,
): Promise<{ roadmapId: string; role: string }> {
  // Mock: always succeeds and returns a viewer role.
  return { roadmapId: SAMPLE_ROADMAP.roadmap.id, role: 'viewer' }
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
