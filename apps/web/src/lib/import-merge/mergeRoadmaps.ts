import type { Phase, Task, TagDefinition } from '@/types/roadmap'
import type { ImportConflict, ImportPreviewSummary, TaskFieldDiff } from './types'
import {
  ensureRegistryForTagIds,
  mergeTagRegistriesWithConflicts,
} from '@/lib/tag-registry'
import { indexRoadmap, type TaskEntry } from './indexRoadmap'
import { matchPhase, matchTask } from './matchRoadmaps'

function fmtBool(v: boolean, trueLabel: string, falseLabel: string): string {
  return v ? trueLabel : falseLabel
}

function fmtList(items: string[]): string {
  return items.length > 0 ? items.join(', ') : '—'
}

function fmtClaim(task: Task): string {
  if (!task.claimedBy) return '—'
  return task.claimedAt ? `${task.claimedBy} since ${task.claimedAt}` : task.claimedBy
}

function fmtLinks(task: Task): string {
  return (task.links ?? []).map((link) => link.label ?? link.url).join(', ') || '—'
}

function claimFieldsMatch(a: Task, b: Task): boolean {
  return (
    (a.claimedBy ?? '') === (b.claimedBy ?? '') &&
    (a.claimedById ?? '') === (b.claimedById ?? '') &&
    (a.claimedAt ?? '') === (b.claimedAt ?? '')
  )
}

function computeTaskFieldDiffs(a: Task, b: Task): TaskFieldDiff[] {
  const diffs: TaskFieldDiff[] = []
  if (a.title !== b.title) {
    diffs.push({ field: 'title', current: a.title, imported: b.title })
  }
  if (a.done !== b.done) {
    diffs.push({ field: 'done', current: fmtBool(a.done, 'done', 'pending'), imported: fmtBool(b.done, 'done', 'pending') })
  }
  if ((a.next ?? false) !== (b.next ?? false)) {
    diffs.push({ field: 'next', current: fmtBool(a.next ?? false, 'yes', 'no'), imported: fmtBool(b.next ?? false, 'yes', 'no') })
  }
  if ((a.est ?? '') !== (b.est ?? '')) {
    diffs.push({ field: 'est', current: a.est ?? '—', imported: b.est ?? '—' })
  }
  if ((a.desc ?? '') !== (b.desc ?? '')) {
    diffs.push({ field: 'desc', current: a.desc ? '(has description)' : '—', imported: b.desc ? '(has description)' : '—' })
  }
  if (JSON.stringify(a.tags ?? []) !== JSON.stringify(b.tags ?? [])) {
    diffs.push({ field: 'tags', current: fmtList(a.tags ?? []), imported: fmtList(b.tags ?? []) })
  }
  if (JSON.stringify(a.assignees ?? []) !== JSON.stringify(b.assignees ?? [])) {
    diffs.push({ field: 'assignees', current: fmtList(a.assignees ?? []), imported: fmtList(b.assignees ?? []) })
  }
  if (!claimFieldsMatch(a, b)) {
    diffs.push({ field: 'claim', current: fmtClaim(a), imported: fmtClaim(b) })
  }
  if (JSON.stringify(a.links ?? []) !== JSON.stringify(b.links ?? [])) {
    diffs.push({ field: 'links', current: fmtLinks(a), imported: fmtLinks(b) })
  }
  return diffs
}

function taskFieldsMatch(a: Task, b: Task): boolean {
  return (
    a.title === b.title &&
    a.done === b.done &&
    (a.next ?? false) === (b.next ?? false) &&
    (a.est ?? '') === (b.est ?? '') &&
    (a.desc ?? '') === (b.desc ?? '') &&
    JSON.stringify(a.tags ?? []) === JSON.stringify(b.tags ?? []) &&
    JSON.stringify(a.assignees ?? []) === JSON.stringify(b.assignees ?? []) &&
    claimFieldsMatch(a, b) &&
    JSON.stringify(a.links ?? []) === JSON.stringify(b.links ?? [])
  )
}

function pruneStaleRefs(task: Task, validIds: Set<string>): Task {
  const deps = (task.deps ?? []).filter((id) => validIds.has(id))
  const cleaned: Task = { ...task, deps }
  if (task.parentId && !validIds.has(task.parentId)) {
    delete cleaned.parentId
  }
  return cleaned
}

function buildIdCollisionConflict(
  importedPhase: Phase,
  importedTask: Task,
  existingById: TaskEntry,
): ImportConflict {
  return {
    type: 'id-collision',
    kind: 'task',
    importedId: importedTask.id,
    importedTitle: importedTask.title,
    currentId: existingById.task.id,
    phaseName: importedPhase.name,
    message: `Task ID "${importedTask.id}" already exists in another phase — skipped.`,
    fieldDiffs: [{
      field: 'phase',
      current: existingById.phase.name,
      imported: importedPhase.name,
    }],
  }
}

export interface SafeMergeResult {
  phases: Phase[]
  tagRegistry: TagDefinition[]
  preview: ImportPreviewSummary
}

// Applies safe-additions-only merge:
// - Adds imported phases/tasks that have no match in current.
// - Matched entities are never overwritten.
// - Field differences on matched tasks are recorded as conflicts and skipped.
// - Stale deps/parentId in added tasks are pruned after merge.
// - Tag registries are merged (safe-additions only — existing tags preserved).
export function applySafeAdditions(
  current: Phase[],
  imported: Phase[],
  currentRegistry: TagDefinition[] = [],
  importedRegistry: TagDefinition[] = [],
): SafeMergeResult {
  const index = indexRoadmap(current)
  const result: Phase[] = current.map((p) => ({ ...p, tasks: [...p.tasks] }))
  const conflicts: ImportConflict[] = []
  let phasesAdded = 0
  let tasksAdded = 0
  let matchedPhases = 0
  let matchedTasks = 0
  let skippedCount = 0

  for (const importedPhase of imported) {
    const { current: currentPhase } = matchPhase(importedPhase, index)

    if (currentPhase) {
      matchedPhases++
      const resultPhase = result.find((p) => p.id === currentPhase.id)
      if (!resultPhase) continue

      for (const importedTask of importedPhase.tasks) {
        const existingById = index.taskById.get(importedTask.id)
        if (existingById && existingById.phase.id !== currentPhase.id) {
          skippedCount++
          conflicts.push(buildIdCollisionConflict(importedPhase, importedTask, existingById))
          continue
        }

        const { current: currentTaskEntry } = matchTask(importedTask, currentPhase.id, index)

        if (currentTaskEntry) {
          matchedTasks++
          if (!taskFieldsMatch(currentTaskEntry.task, importedTask)) {
            skippedCount++
            const fieldDiffs = computeTaskFieldDiffs(currentTaskEntry.task, importedTask)
            conflicts.push({
              type: 'task-field-conflict',
              kind: 'task',
              importedId: importedTask.id,
              importedTitle: importedTask.title,
              currentId: currentTaskEntry.task.id,
              phaseName: importedPhase.name,
              message: `Task "${importedTask.title}" exists with different fields — skipped.`,
              fieldDiffs,
            })
          }
        } else {
          resultPhase.tasks.push(importedTask)
          tasksAdded++
        }
      }
    } else {
      const safeTasks = importedPhase.tasks.filter((importedTask) => {
        const existingById = index.taskById.get(importedTask.id)
        if (!existingById) return true
        skippedCount++
        conflicts.push(buildIdCollisionConflict(importedPhase, importedTask, existingById))
        return false
      })

      phasesAdded++
      tasksAdded += safeTasks.length
      result.push({ ...importedPhase, tasks: safeTasks })
    }
  }

  const validIds = new Set(result.flatMap((p) => p.tasks.map((t) => t.id)))
  const cleanedResult = result.map((phase) => ({
    ...phase,
    tasks: phase.tasks.map((task) => pruneStaleRefs(task, validIds)),
  }))
  const tagMerge = mergeTagRegistriesWithConflicts(currentRegistry, importedRegistry)
  conflicts.push(...tagMerge.conflicts)
  skippedCount += tagMerge.conflicts.length
  const tagsAdded = Math.max(
    0,
    tagMerge.registry.length - (currentRegistry?.length ?? 0),
  )
  const usedTagIds = cleanedResult.flatMap((phase) =>
    phase.tasks.flatMap((task) => task.tags ?? []),
  )

  return {
    phases: cleanedResult,
    tagRegistry: ensureRegistryForTagIds(usedTagIds, tagMerge.registry),
    preview: {
      phasesAdded,
      tasksAdded,
      tagsAdded,
      matchedPhases,
      matchedTasks,
      conflictsCount: conflicts.length,
      skippedCount,
      repairsCount: 0,
      warningsCount: 0,
      conflicts,
    },
  }
}
