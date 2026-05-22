// ─── Domain models ────────────────────────────────────────────────────────────
// These types describe the core Roadforge data model.
// The backend should expose a JSON API that conforms to these shapes.

export type PhaseStatus = 'done' | 'active' | 'next' | 'future'
export type WorkspaceMode = 'owner' | 'viewer'
export type ExportFormat = 'json'
export type ShareRole = 'owner' | 'editor' | 'viewer'
export type Theme = 'dark' | 'light'
export type SyncStatus = 'local' | 'live' | 'syncing' | 'offline'
export type TaskFilter = 'all' | 'mine' | 'pair' | 'next' | 'open' | 'done' | `person:${string}`

export interface Task {
  id: string
  title: string
  done: boolean
  next?: boolean
  est?: string
  assignees?: string[]
  tags?: string[]
  /** IDs of tasks this task depends on */
  deps?: string[]
  desc?: string
  /** ID of the parent task, if this is a subtask */
  parentId?: string
}

export interface Phase {
  id: string
  /** Zero-padded ordinal, e.g. "01" */
  num: string
  name: string
  /** CSS color string used as the phase accent */
  color: string
  status: PhaseStatus
  /** 0–100 */
  progress: number
  tasks: Task[]
}

export interface Project {
  id: string
  name: string
}

export interface RoadmapMeta {
  id: string
  name: string
  isPasswordEnabled?: boolean
}

export interface Roadmap {
  project: Project
  roadmap: RoadmapMeta
  phases: Phase[]
  ownerDisplayName: string
  updatedAt: string
}

export type ActivityAction =
  | 'roadmap.updated'
  | 'roadmap.imported'
  | 'roadmap.batch_changed'
  | 'phase.completed'
  | 'phase.reopened'
  | 'task.created'
  | 'task.completed'
  | 'task.reopened'
  | 'task.updated'
  | 'task.dependency.linked'
  | 'task.dependency.unlinked'
  | 'task.reordered'

export interface ActivityChange {
  action: ActivityAction
  entity_type?: string
  entity_id?: string
  taskId?: string
  taskTitle?: string
  phaseId?: string
  phaseName?: string
  phaseNum?: string
  parentId?: string
  dependencyId?: string
  dependencyTitle?: string
  roadmapName?: string
  phase_count?: number
  task_count?: number
  phaseCount?: number
  taskCount?: number
  details?: string
}

export interface ChangeSummary extends ActivityChange {
  changes?: ActivityChange[]
  counts?: Record<string, number>
  primary_change?: ActivityChange
}

// ─── Collaboration / sharing ───────────────────────────────────────────────────

export interface ShareLink {
  id: string | null
  role: ShareRole
  /** Icon name for the UI */
  icon: string
  desc: string
  url: string
  isActive: boolean
  tokenPrefix?: string | null
  createdAt?: string | null
  rotatedAt?: string | null
  recommended?: boolean
}

export interface Participant {
  id: string
  displayName: string
  role: ShareRole
  createdAt: string
  lastSeenAt: string | null
  revokedAt: string | null
  isCurrentParticipant: boolean
}

// ─── Import / Export ───────────────────────────────────────────────────────────

export interface ExportOption {
  id: ExportFormat
  icon: string
  name: string
  badge?: string
  desc: string
}

// ─── Activity Logs ─────────────────────────────────────────────────────────────

export interface ActivityLog {
  id: string
  roadmap_id: string
  participant_id: string | null
  actor_name: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  before_json: Record<string, unknown> | null
  after_json: Record<string, unknown> | null
  metadata_json: Record<string, unknown> | null
  created_at: string
}

export interface ActivityLogList {
  logs: ActivityLog[]
  has_more: boolean
}
