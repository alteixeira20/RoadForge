import type { ImportedRoadmap } from '@/lib/roadmap-validation'
import type { RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'

// ─── Import modes ──────────────────────────────────────────────────────────────

export type ImportMode = 'new-local' | 'replace-current' | 'safe-additions'
export type ReplaceImportScope = 'synced' | 'local'

// ─── Merge entity types ────────────────────────────────────────────────────────

import type { ConflictType, EntityKind, TaskFieldDiff, ImportConflict } from './conflict-types'
export type { ConflictType, EntityKind, TaskFieldDiff, ImportConflict }
export type MatchStrategy = 'id' | 'fallback' | 'none'

export interface ImportPreviewSummary {
  phasesAdded: number
  tasksAdded: number
  tagsAdded: number
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
  fileName: string
  result: ImportedRoadmap
  mode: ImportMode
  upgradeNotices: RoadmapUpgradeNotice[]
  replaceScope: ReplaceImportScope
  mergePreview?: ImportPreviewSummary
  currentStats?: CurrentRoadmapStats
}
