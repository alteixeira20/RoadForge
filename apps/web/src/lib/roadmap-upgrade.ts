import { normalizePhasesProgress, renumberPhases } from '@/lib/phase-progress'
import {
  dedupeNames,
  getTaskAssignees,
  getVisibleTaskTags,
} from '@/lib/task-assignment'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'
import type { Phase, PhaseStatus, Task } from '@/types/roadmap'

export type RoadmapUpgradeSeverity = 'info' | 'warning'

export interface RoadmapUpgradeNotice {
  code: string
  message: string
  severity: RoadmapUpgradeSeverity
}

export interface RoadmapUpgradeResult {
  phases: Phase[]
  roadmapName?: string
  notices: RoadmapUpgradeNotice[]
  changed: boolean
}

const DEFAULT_PHASE_COLOR = '#808080'
const VALID_STATUSES = new Set<PhaseStatus>(['done', 'active', 'next', 'future'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  values.forEach((value) => {
    const clean = value.trim()
    if (!clean || seen.has(clean)) return
    seen.add(clean)
    result.push(clean)
  })
  return result
}

function snapshotFromInput(input: unknown): Record<string, unknown> {
  if (Array.isArray(input)) return { phases: input }
  if (isPlainObject(input)) {
    const roadmapName = typeof input.roadmapName === 'string'
      ? input.roadmapName
      : isPlainObject(input.roadmap) && typeof input.roadmap.name === 'string'
        ? input.roadmap.name
        : undefined
    return {
      ...input,
      ...(roadmapName ? { roadmap: { ...(isPlainObject(input.roadmap) ? input.roadmap : {}), name: roadmapName } } : {}),
    }
  }
  return { phases: [] }
}

function notice(
  notices: RoadmapUpgradeNotice[],
  seen: Set<string>,
  code: string,
  message: string,
  severity: RoadmapUpgradeSeverity = 'info',
): void {
  if (seen.has(code)) return
  seen.add(code)
  notices.push({ code, message, severity })
}

function inferPhaseStatus(phase: Phase, index: number): PhaseStatus {
  if (VALID_STATUSES.has(phase.status)) return phase.status
  if (phase.tasks.length > 0 && phase.tasks.every((task) => task.done)) return 'done'
  if (index === 0) return 'active'
  return 'future'
}

function canonicalizeTask(
  task: Task,
  taskIds: Set<string>,
  notices: RoadmapUpgradeNotice[],
  seenNoticeCodes: Set<string>,
): Task {
  const tags = getVisibleTaskTags(task)
  const assignees = dedupeNames(getTaskAssignees(task))
  const deps = dedupeStrings(task.deps ?? []).filter((id) => taskIds.has(id))
  const next: Task = {
    id: task.id,
    title: task.title,
    done: task.done === true,
    next: task.next === true,
    tags,
    assignees,
    deps,
  }

  if ((task.deps ?? []).length !== deps.length) {
    notice(
      notices,
      seenNoticeCodes,
      'stale_refs_removed',
      'References to missing tasks were removed.',
      'warning',
    )
  }

  if (task.est) next.est = task.est
  if (task.desc) next.desc = task.desc
  if (task.claimedBy) next.claimedBy = task.claimedBy
  if (task.claimedById) next.claimedById = task.claimedById
  if (task.claimedAt) next.claimedAt = task.claimedAt
  if (task.parentId && taskIds.has(task.parentId)) {
    next.parentId = task.parentId
  } else if (task.parentId) {
    notice(
      notices,
      seenNoticeCodes,
      'stale_refs_removed',
      'References to missing tasks were removed.',
      'warning',
    )
  }

  return next
}

function canonicalizePhases(
  phases: Phase[],
  notices: RoadmapUpgradeNotice[],
  seenNoticeCodes: Set<string>,
): Phase[] {
  const taskIds = new Set(phases.flatMap((phase) => phase.tasks.map((task) => task.id)))
  const nextPhases = phases.map((phase, index) => {
    const tasks = phase.tasks.map((task) => canonicalizeTask(task, taskIds, notices, seenNoticeCodes))
    const status = inferPhaseStatus(phase, index)
    const color = phase.color?.trim() || DEFAULT_PHASE_COLOR
    return {
      ...phase,
      color,
      status,
      tasks,
    }
  })
  return renumberPhases(normalizePhasesProgress(nextPhases))
}

function addCanonicalNotices(
  before: Phase[],
  after: Phase[],
  notices: RoadmapUpgradeNotice[],
  seenNoticeCodes: Set<string>,
): void {
  if (before.some((phase, index) => phase.num !== after[index]?.num)) {
    notice(
      notices,
      seenNoticeCodes,
      'phase_numbers_normalized',
      'Phase numbers were normalized to match the current order.',
    )
  }

  if (before.some((phase, index) => phase.progress !== after[index]?.progress)) {
    notice(
      notices,
      seenNoticeCodes,
      'progress_recalculated',
      'Phase progress percentages were recalculated from task completion.',
    )
  }

  const beforeTasks = before.flatMap((phase) => phase.tasks)
  const afterTasks = after.flatMap((phase) => phase.tasks)
  const taskDefaultsChanged = beforeTasks.some((task, index) => {
    const afterTask = afterTasks[index]
    if (!afterTask) return true
    return task.next !== afterTask.next ||
      JSON.stringify(task.tags ?? undefined) !== JSON.stringify(afterTask.tags) ||
      JSON.stringify(task.assignees ?? undefined) !== JSON.stringify(afterTask.assignees) ||
      JSON.stringify(task.deps ?? undefined) !== JSON.stringify(afterTask.deps)
  })
  if (taskDefaultsChanged) {
    notice(
      notices,
      seenNoticeCodes,
      'task_defaults_added',
      'Missing task defaults were filled in for the current roadmap schema.',
    )
  }
}

export function upgradeRoadmapSnapshot(input: unknown): RoadmapUpgradeResult {
  const snapshot = snapshotFromInput(input)
  const parsed = parseImportedRoadmapJson(JSON.stringify(snapshot))
  const seenNoticeCodes = new Set<string>()
  const notices: RoadmapUpgradeNotice[] = []

  parsed.repairs.forEach((repair) => {
    notice(notices, seenNoticeCodes, repair.code, repair.message)
  })

  const phases = canonicalizePhases(parsed.phases, notices, seenNoticeCodes)
  addCanonicalNotices(parsed.phases, phases, notices, seenNoticeCodes)

  const beforeJson = JSON.stringify({
    roadmapName: parsed.roadmapName,
    phases: parsed.phases,
  })
  const afterJson = JSON.stringify({
    roadmapName: parsed.roadmapName,
    phases,
  })

  return {
    phases,
    roadmapName: parsed.roadmapName,
    notices,
    changed: beforeJson !== afterJson || parsed.repairs.length > 0,
  }
}
