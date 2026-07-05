// ─── Domain models ────────────────────────────────────────────────────────────
// These types describe the core RoadForge data model.
// The backend should expose a JSON API that conforms to these shapes.

export interface TagDefinition {
  id: string
  label: string
  color?: string
  createdAt?: string
  updatedAt?: string
}

export type PhaseStatus = 'done' | 'active' | 'next' | 'future'
export type PhaseColorMode = 'auto' | 'manual'
export type WorkspaceMode = 'owner' | 'viewer'
export type WorkspaceView = 'roadmap' | 'team'
export type ExportFormat = 'json'
export type ShareRole = 'owner' | 'editor' | 'viewer'
export type Theme = 'dark' | 'light'
export type SyncStatus = 'local' | 'live' | 'syncing' | 'offline' | 'conflict'
export type RealtimeConnectionStatus =
  | 'local'
  | 'connecting'
  | 'live'
  | 'updating'
  | 'reconnecting'
  | 'offline'
export type TaskStatusFilter = 'all' | 'open' | 'done'
export type TaskClaimFilter = 'all' | 'mine' | 'claimed' | 'unclaimed'
export type TaskExternalLinkProvider = 'github' | 'url'
export type TaskExternalLinkKind =
  | 'issue'
  | 'pull'
  | 'discussion'
  | 'commit'
  | 'release'
  | 'url'

export interface TaskExternalLink {
  /** Stable RoadForge-local identifier; not a provider credential or remote ID. */
  id: string
  provider: TaskExternalLinkProvider
  kind: TaskExternalLinkKind
  url: string
  owner?: string
  repo?: string
  number?: number
  sha?: string
  tag?: string
  label?: string
}

export interface FilterState {
  query: string
  status: TaskStatusFilter
  assignees: string[]
  tags: string[]
  phaseIds: string[]
  claim: TaskClaimFilter
  recommended: boolean
}

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
  /** Display name of the participant who claimed this task */
  claimedBy?: string
  /** Participant ID of the claimer */
  claimedById?: string
  /** ISO timestamp when the task was claimed */
  claimedAt?: string
  /** Credential-free references to external implementation evidence. */
  links?: TaskExternalLink[]
}

export interface Phase {
  id: string
  /** Zero-padded ordinal, e.g. "01" */
  num: string
  name: string
  /** CSS color string used as the phase accent */
  color: string
  colorMode?: PhaseColorMode
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
  tagRegistry?: TagDefinition[]
  ownerDisplayName: string
  updatedAt: string
}

export interface RoadmapConflictSummary {
  phase_count: number
  task_count: number
  phase_ids?: string[]
  task_ids?: string[]
}

export interface RoadmapConflictMetadata {
  roadmap_id: string
  server_updated_at: string
  client_last_updated_at: string
  server: {
    name: string
    phases: Phase[]
  }
  summary?: RoadmapConflictSummary | null
}

export interface RoadmapConflictResponse {
  detail: string
  code: 'roadmap_conflict'
  conflict: RoadmapConflictMetadata
}

export type ActivityAction =
  | 'roadmap.updated'
  | 'roadmap.renamed'
  | 'roadmap.imported'
  | 'import.replaced'
  | 'roadmap.restored'
  | 'roadmap.batch_changed'
  | 'roadmap.phases_reordered'
  | 'phase.completed'
  | 'phase.reopened'
  | 'task.created'
  | 'task.completed'
  | 'task.reopened'
  | 'task.updated'
  | 'task.dependency.linked'
  | 'task.dependency.unlinked'
  | 'task.reordered'
  | 'task.claimed'
  | 'task.unclaimed'

export type TaskActivityField = 'title' | 'desc' | 'est' | 'assignees' | 'tags'

export interface ActivityChange {
  action: ActivityAction
  entity_type?: string
  entity_id?: string
  taskId?: string
  taskTitle?: string
  changedFields?: TaskActivityField[]
  phaseId?: string
  phaseName?: string
  phaseNum?: string
  parentId?: string
  dependencyId?: string
  dependencyTitle?: string
  roadmapName?: string
  previousRoadmapName?: string
  nextRoadmapName?: string
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
  isCurrentParticipant: boolean
  /**
   * Fields below are only present in the full (owner) projection.
   * Editors receive a reduced projection without session/link metadata.
   */
  createdAt?: string
  lastSeenAt?: string | null
  sessionExpiresAt?: string | null
  revokedAt?: string | null
  shareLinkId?: string | null
  joinedViaRole?: ShareRole | null
  accessSourceLabel?: string
}

export interface RoadmapVersionSummary {
  id: string
  versionNumber: number
  createdAt: string
  actorName: string | null
  action: string | null
  phaseCount: number
  taskCount: number
}

export interface RoadmapVersionDetail extends RoadmapVersionSummary {
  roadmapName: string
  phases: Phase[]
  metadataJson: Record<string, unknown> | null
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
