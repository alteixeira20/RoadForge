import type { Phase } from '@/types/roadmap'
import type { ImportedRoadmap } from '@/lib/roadmap-validation'
import type { RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'

// ─── Import modes ──────────────────────────────────────────────────────────────

export type ImportMode = 'new-local' | 'replace-current' | 'safe-additions'
export type ReplaceImportScope = 'synced' | 'local'

// ─── Merge entity types ────────────────────────────────────────────────────────

export type EntityKind = 'phase' | 'task'
export type MatchStrategy = 'id' | 'fallback' | 'none'

export type ConflictType =
  | 'task-field-conflict'
  | 'id-collision'

export interface TaskFieldDiff {
  field: string
  current: string
  imported: string
}

export interface ImportConflict {
  type: ConflictType
  kind: EntityKind
  importedId: string
  importedTitle?: string
  currentId?: string
  phaseName?: string
  field?: string
  message: string
  fieldDiffs?: TaskFieldDiff[]
}

export interface ImportPreviewSummary {
  phasesAdded: number
  tasksAdded: number
  matchedPhases: number
  matchedTasks: number
  conflictsCount: number
  skippedCount: number
  repairsCount: number
  warningsCount: number
  conflicts: ImportConflict[]
}

// ─── Pending import state (shared between IOModal and ImportNotice) ────────────

export interface CurrentRoadmapStats {
  phaseCount: number
  taskCount: number
}

export interface PendingImport {
  result: ImportedRoadmap
  mode: ImportMode
  upgradeNotices: RoadmapUpgradeNotice[]
  replaceScope: ReplaceImportScope
  mergedPhases?: Phase[]
  mergePreview?: ImportPreviewSummary
  currentStats?: CurrentRoadmapStats
}
