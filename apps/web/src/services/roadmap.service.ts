// ─── Roadmap service (compatibility barrel) ─────────────────────────────────────
// This file re-exports every public symbol from the domain service files so that
// existing consumer imports from '@/services/roadmap.service' continue to work
// without any changes.
//
// No implementation lives here.  All logic is in:
//   roadmap-http.ts             — HTTP helpers, ApiConnectionError, requestJson
//   roadmap-crud.service.ts     — create/get/update/delete, versions, import/export
//   roadmap-realtime.service.ts — SSE tickets, event subscriptions, activity log
//   roadmap-locks.service.ts    — acquire/release/list locks
//   roadmap-sharing.service.ts  — share links, participants, join

export {
  ApiConnectionError,
  isApiConnectionError,
} from './roadmap-http'

export type {
  CheckpointResult,
} from './roadmap-crud.service'

export {
  createRoadmap,
  getRoadmap,
  deleteRoadmap,
  saveToServer,
  patchTaskDone,
  getRoadmapVersions,
  getRoadmapVersion,
  restoreRoadmapVersion,
  createRoadmapCheckpoint,
  updateTaskDone,
  exportRoadmap,
  importRoadmap,
  addPhase,
  reorderPhases,
  addTask,
  linkDependency,
} from './roadmap-crud.service'

export type {
  RealtimeHandlers,
} from './roadmap-realtime.service'

export {
  getEventTicket,
  subscribeToRoadmapEvents,
  getRoadmapActivity,
} from './roadmap-realtime.service'

export type {
  ApiLockResponse,
} from './roadmap-locks.service'

export {
  acquireLock,
  releaseLock,
  getLocks,
} from './roadmap-locks.service'

export {
  getShareLinks,
  regenerateShareLink,
  revokeShareLink,
  getParticipants,
  revokeParticipant,
  joinRoadmap,
} from './roadmap-sharing.service'
