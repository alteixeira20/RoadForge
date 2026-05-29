import type { ImportedRoadmap } from '@/lib/roadmap-validation'
import type { RoadmapUpgradeNotice } from '@/lib/roadmap-upgrade'
import type { ImportPreviewSummary } from './types'

// Builds a preview summary for new-local and replace-current imports.
// For safe-additions, the preview comes from applySafeAdditions directly.
export function buildBasicPreview(
  imported: ImportedRoadmap,
  upgradeNotices: RoadmapUpgradeNotice[],
): ImportPreviewSummary {
  const tasksAdded = imported.phases.reduce((sum, p) => sum + p.tasks.length, 0)
  return {
    phasesAdded: imported.phases.length,
    tasksAdded,
    matchedPhases: 0,
    matchedTasks: 0,
    conflictsCount: 0,
    skippedCount: 0,
    repairsCount: imported.repairs.length,
    warningsCount: imported.warnings.length + upgradeNotices.length,
    conflicts: [],
  }
}
