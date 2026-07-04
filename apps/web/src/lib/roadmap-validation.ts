import { isAssignmentTag, assignmentNameFromTag } from '@/lib/task-assignment'
import {
  normalizeTagColor,
  normalizeTagLabel,
  normalizedTagLabelKey,
  TAG_ID_MAX,
  TAG_ID_PATTERN,
  TAG_REGISTRY_MAX,
} from '@/lib/tag-registry'
import type { Phase, PhaseStatus, TagDefinition, Task } from '@/types/roadmap'

// ─── Compatibility warnings ───────────────────────────────────────────────────

export type CompatibilityWarningCode =
  | 'schema_unknown'
  | 'version_future'
  | 'missing_assignees'
  | 'unknown_fields'

export interface CompatibilityWarning {
  code: CompatibilityWarningCode
  message: string
}

// ─── Import repairs ───────────────────────────────────────────────────────────

export type ImportRepairCode =
  | 'generated_required'
  | 'coerced_boolean'
  | 'null_optional'
  | 'coerced_array'
  | 'progress_recalculated'
  | 'inferred_phase_field'
  | 'legacy_assignees'
  | 'duplicate_ids'
  | 'stale_parent_removed'
  | 'tag_registry_repaired'

export interface ImportRepair {
  code: ImportRepairCode
  message: string
}

const REPAIR_MESSAGES: Record<ImportRepairCode, string> = {
  generated_required:
    'Missing required task fields (id or title) were generated automatically.',
  coerced_boolean:
    'Boolean task fields (done, next) were coerced from non-boolean values.',
  null_optional:
    'Null values on optional fields were cleared.',
  coerced_array:
    'Non-array fields (tags, deps, assignees, or tasks) were replaced with empty arrays.',
  progress_recalculated:
    'Phase progress percentages were recalculated from task completion.',
  inferred_phase_field:
    'Missing or invalid phase fields (num, status, color, color mode, or name) were inferred automatically.',
  legacy_assignees:
    'Assignment tags (owner:, review:) were migrated to the assignees field.',
  duplicate_ids:
    'Duplicate task IDs were renamed to be unique.',
  stale_parent_removed:
    'parentId references to non-existent tasks were removed.',
  tag_registry_repaired:
    'Invalid or duplicate tag registry definitions were removed or normalized.',
}

// Import files are parsed locally, so this can exceed the API request-body cap.

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024

// Validation limits mirrored from apps/api/src/api/schemas/limits.py.
const PHASES_MAX = 50
const TASKS_PER_PHASE_MAX = 200
const TASK_TITLE_MAX = 160
const TASK_DESC_MAX = 2_000
const TASK_EST_MAX = 64
const TASK_TAGS_MAX = 20
const TASK_ASSIGNEES_MAX = 20
const TASK_DEPS_MAX = 50
const TAG_MAX = 40
const ASSIGNEE_MAX = 128
const ID_MAX = 80
const PHASE_NAME_MAX = 120
const PHASE_NUM_MAX = 12
const PHASE_COLOR_MAX = 64

// ─── Low-level guards ─────────────────────────────────────────────────────────

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/
const SUSPICIOUS = ['<script', 'javascript:', 'data:text/html'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertNoUnsafeKeys(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (UNSAFE_KEYS.has(key)) throw new Error(`Unsafe key "${key}" in import`)
  }
}

function rejectSuspiciousText(value: string, field: string): void {
  if (CONTROL_RE.test(value)) throw new Error(`${field} contains invalid characters`)
  const lower = value.toLowerCase()
  for (const frag of SUSPICIOUS) {
    if (lower.includes(frag)) throw new Error(`${field} contains invalid content`)
  }
}

// ─── Text cleaners ────────────────────────────────────────────────────────────

function cleanRequiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const t = value.trim()
  if (!t) throw new Error(`${field} must not be blank`)
  if (t.length > max) throw new Error(`${field} exceeds ${max} characters`)
  rejectSuspiciousText(t, field)
  return t
}

function cleanOptionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const t = value.trim()
  if (!t) return undefined
  if (t.length > max) throw new Error(`${field} exceeds ${max} characters`)
  rejectSuspiciousText(t, field)
  return t
}

// ─── Array validator ──────────────────────────────────────────────────────────

function validateStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxItemLength: number,
): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`)
  if (value.length > maxItems) throw new Error(`${field} exceeds ${maxItems} items`)
  return value.map((item: unknown, i: number) =>
    cleanRequiredText(item, `${field}[${i}]`, maxItemLength),
  )
}

// ─── Domain validators ────────────────────────────────────────────────────────

function validateTask(value: unknown): Task {
  if (!isPlainObject(value)) throw new Error('task must be an object')
  assertNoUnsafeKeys(value)
  const id = cleanRequiredText(value.id, 'task.id', ID_MAX)
  const title = cleanRequiredText(value.title, 'task.title', TASK_TITLE_MAX)
  if (typeof value.done !== 'boolean') throw new Error('task.done must be a boolean')
  if (value.next !== undefined && typeof value.next !== 'boolean') {
    throw new Error('task.next must be a boolean')
  }
  const task: Task = { id, title, done: value.done }
  if (value.next !== undefined) task.next = value.next as boolean
  const est = cleanOptionalText(value.est, 'task.est', TASK_EST_MAX)
  if (est !== undefined) task.est = est
  const tags = validateStringArray(value.tags, 'task.tags', TASK_TAGS_MAX, TAG_MAX)
  if (tags !== undefined) task.tags = tags
  const assignees = validateStringArray(value.assignees, 'task.assignees', TASK_ASSIGNEES_MAX, ASSIGNEE_MAX)
  if (assignees !== undefined) task.assignees = assignees
  const deps = validateStringArray(value.deps, 'task.deps', TASK_DEPS_MAX, ID_MAX)
  if (deps !== undefined) task.deps = deps
  const desc = cleanOptionalText(value.desc, 'task.desc', TASK_DESC_MAX)
  if (desc !== undefined) task.desc = desc
  const parentId = cleanOptionalText(value.parentId, 'task.parentId', ID_MAX)
  if (parentId !== undefined) task.parentId = parentId
  const claimedBy = cleanOptionalText(value.claimedBy, 'task.claimedBy', ASSIGNEE_MAX)
  if (claimedBy !== undefined) task.claimedBy = claimedBy
  const claimedById = cleanOptionalText(value.claimedById, 'task.claimedById', ID_MAX)
  if (claimedById !== undefined) task.claimedById = claimedById
  if (typeof value.claimedAt === 'string' && !isNaN(Date.parse(value.claimedAt))) {
    task.claimedAt = value.claimedAt
  }
  return task
}

const VALID_STATUSES = new Set<string>(['done', 'active', 'next', 'future'])

function validatePhase(value: unknown): Phase {
  if (!isPlainObject(value)) throw new Error('phase must be an object')
  assertNoUnsafeKeys(value)
  const id = cleanRequiredText(value.id, 'phase.id', ID_MAX)
  const num = cleanRequiredText(value.num, 'phase.num', PHASE_NUM_MAX)
  const name = cleanRequiredText(value.name, 'phase.name', PHASE_NAME_MAX)
  const color = cleanRequiredText(value.color, 'phase.color', PHASE_COLOR_MAX)
  const colorMode = value.colorMode === 'auto' || value.colorMode === 'manual'
    ? value.colorMode
    : undefined
  if (!VALID_STATUSES.has(value.status as string)) throw new Error('phase.status is invalid')
  if (typeof value.progress !== 'number' || value.progress < 0 || value.progress > 100) {
    throw new Error('phase.progress must be 0–100')
  }
  if (!Array.isArray(value.tasks)) throw new Error('phase.tasks must be an array')
  if (value.tasks.length > TASKS_PER_PHASE_MAX) {
    throw new Error(`phase has too many tasks (max ${TASKS_PER_PHASE_MAX})`)
  }
  const tasks = (value.tasks as unknown[]).map((t) => validateTask(t))
  return {
    id,
    num,
    name,
    color,
    ...(colorMode ? { colorMode } : {}),
    status: value.status as PhaseStatus,
    progress: value.progress as number,
    tasks,
  }
}

// ─── Compatibility detection ──────────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = 1
const KNOWN_SCHEMAS = new Set([
  'anvilary.roadmap.import',
  'anvilary.roadmap.export',
  'roadforge.roadmap.import',
  'roadforge.roadmap.export',
])
const KNOWN_TOP_LEVEL_KEYS = new Set([
  'schema', 'version', 'exportedAt', 'roadmap', 'collaborator', 'phases',
  'tagRegistry', 'meta',
])
const KNOWN_PHASE_KEYS = new Set([
  'id', 'num', 'name', 'color', 'colorMode', 'status', 'progress', 'tasks',
])
const KNOWN_TASK_KEYS = new Set([
  'id', 'title', 'done', 'next', 'est', 'tags', 'assignees', 'deps', 'desc', 'parentId',
  'claimedBy', 'claimedById', 'claimedAt',
])

function detectCompatibilityWarnings(raw: unknown): CompatibilityWarning[] {
  const warnings: CompatibilityWarning[] = []
  if (!isPlainObject(raw)) return warnings

  const schema = raw.schema
  const version = raw.version
  const schemaKnown = typeof schema === 'string' && KNOWN_SCHEMAS.has(schema)
  const versionIsNumber = typeof version === 'number'
  const versionIsCurrent = versionIsNumber && version === CURRENT_SCHEMA_VERSION

  // A+B: Schema or version mismatch
  if (versionIsNumber && version > CURRENT_SCHEMA_VERSION) {
    warnings.push({
      code: 'version_future',
      message: `This file was created with a newer version of RoadForge (v${version}). Some data may not be recognized.`,
    })
  } else if (!schemaKnown || !versionIsCurrent) {
    warnings.push({
      code: 'schema_unknown',
      message: 'This file was created with an older or different RoadForge format. Some newer metadata may be missing.',
    })
  }

  // D: Unknown top-level, phase, or task fields (aggregate)
  let foundUnknown = false
  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) { foundUnknown = true; break }
  }
  if (!foundUnknown && Array.isArray(raw.phases)) {
    outer: for (const phase of raw.phases as unknown[]) {
      if (!isPlainObject(phase)) continue
      for (const key of Object.keys(phase)) {
        if (!KNOWN_PHASE_KEYS.has(key)) { foundUnknown = true; break outer }
      }
      if (Array.isArray(phase.tasks)) {
        for (const task of phase.tasks as unknown[]) {
          if (!isPlainObject(task)) continue
          for (const key of Object.keys(task)) {
            if (!KNOWN_TASK_KEYS.has(key)) { foundUnknown = true; break outer }
          }
        }
      }
    }
  }
  if (foundUnknown) {
    warnings.push({
      code: 'unknown_fields',
      message: 'Some fields in this file are not supported by this version and may be ignored.',
    })
  }

  // C: Missing assignment metadata — only relevant for older-format files
  const hasOlderFormat = warnings.some((w) => w.code === 'schema_unknown')
  if (hasOlderFormat && Array.isArray(raw.phases)) {
    let hasTasks = false
    let hasAssignmentInfo = false
    assigneeCheck: for (const phase of raw.phases as unknown[]) {
      if (!isPlainObject(phase) || !Array.isArray(phase.tasks)) continue
      for (const task of phase.tasks as unknown[]) {
        if (!isPlainObject(task)) continue
        hasTasks = true
        if (Array.isArray(task.assignees) && task.assignees.length > 0) {
          hasAssignmentInfo = true; break assigneeCheck
        }
        if (Array.isArray(task.tags)) {
          for (const tag of task.tags) {
            if (typeof tag === 'string' && (tag.startsWith('owner:') || tag.startsWith('review:'))) {
              hasAssignmentInfo = true; break assigneeCheck
            }
          }
        }
      }
    }
    if (hasTasks && !hasAssignmentInfo) {
      warnings.push({
        code: 'missing_assignees',
        message: 'No assignment metadata found. Tasks may not have assignees in this roadmap.',
      })
    }
  }

  return warnings
}

// ─── Import repair pipeline ───────────────────────────────────────────────────

interface IdGen { seq: number }
function makeIdGen(): IdGen { return { seq: 0 } }
function genTaskId(gen: IdGen): string {
  return `rf-t-${++gen.seq}`
}

function genPhaseId(index: number): string {
  return `rf-p-${index + 1}`
}

type RepairCounts = Partial<Record<ImportRepairCode, number>>

function bump(counts: RepairCounts, code: ImportRepairCode): void {
  counts[code] = (counts[code] ?? 0) + 1
}

function repairTaskRaw(
  raw: unknown,
  seenIds: Set<string>,
  counts: RepairCounts,
  gen: IdGen,
): Record<string, unknown> {
  if (!isPlainObject(raw)) {
    bump(counts, 'generated_required')
    const id = genTaskId(gen)
    seenIds.add(id)
    return { id, title: 'Untitled task', done: false }
  }

  const t: Record<string, unknown> = { ...raw }

  // id: must be non-empty string
  if (typeof t.id !== 'string' || !t.id.trim()) {
    bump(counts, 'generated_required')
    t.id = genTaskId(gen)
  } else {
    const trimmed = t.id.trim()
    if (seenIds.has(trimmed)) {
      bump(counts, 'duplicate_ids')
      let suffix = 2
      let candidate = `${trimmed}-dup${suffix}`
      while (seenIds.has(candidate)) { suffix++; candidate = `${trimmed}-dup${suffix}` }
      t.id = candidate
    } else {
      t.id = trimmed
    }
  }
  seenIds.add(t.id as string)

  // title: must be non-empty string
  if (typeof t.title !== 'string' || !t.title.trim()) {
    bump(counts, 'generated_required')
    t.title = 'Untitled task'
  }

  // done: must be boolean
  if (typeof t.done !== 'boolean') {
    bump(counts, 'coerced_boolean')
    t.done = Boolean(t.done)
  }

  // next: optional boolean
  if (t.next !== undefined) {
    if (t.next === null) {
      bump(counts, 'null_optional')
      delete t.next
    } else if (typeof t.next !== 'boolean') {
      bump(counts, 'coerced_boolean')
      t.next = Boolean(t.next)
    }
  }

  // est: optional string — null → remove
  if (t.est === null) {
    bump(counts, 'null_optional')
    delete t.est
  }

  // desc: optional string — null → remove
  if (t.desc === null) {
    bump(counts, 'null_optional')
    delete t.desc
  }

  // parentId: optional string — null → remove (stale refs handled in pass 2)
  if (t.parentId === null) {
    bump(counts, 'null_optional')
    delete t.parentId
  }

  // tags: optional array
  if (t.tags !== undefined) {
    if (t.tags === null) {
      bump(counts, 'null_optional')
      delete t.tags
    } else if (!Array.isArray(t.tags)) {
      bump(counts, 'coerced_array')
      t.tags = typeof t.tags === 'string' ? [t.tags] : []
    }
  }

  // assignees: optional array
  if (t.assignees !== undefined) {
    if (t.assignees === null) {
      bump(counts, 'null_optional')
      delete t.assignees
    } else if (!Array.isArray(t.assignees)) {
      bump(counts, 'coerced_array')
      t.assignees = typeof t.assignees === 'string' ? [t.assignees] : []
    }
  }

  // deps: optional array
  if (t.deps !== undefined) {
    if (t.deps === null) {
      bump(counts, 'null_optional')
      delete t.deps
    } else if (!Array.isArray(t.deps)) {
      bump(counts, 'coerced_array')
      t.deps = typeof t.deps === 'string' ? [t.deps] : []
    }
  }

  // claimedBy: optional string — null or non-string → remove
  if (t.claimedBy !== undefined) {
    if (t.claimedBy === null || typeof t.claimedBy !== 'string') {
      bump(counts, 'null_optional')
      delete t.claimedBy
    }
  }

  // claimedById: optional string — null or non-string → remove
  if (t.claimedById !== undefined) {
    if (t.claimedById === null || typeof t.claimedById !== 'string') {
      bump(counts, 'null_optional')
      delete t.claimedById
    }
  }

  // claimedAt: optional ISO timestamp string — null, non-string, or invalid → remove
  if (t.claimedAt !== undefined) {
    if (t.claimedAt === null || typeof t.claimedAt !== 'string' || isNaN(Date.parse(t.claimedAt as string))) {
      bump(counts, 'null_optional')
      delete t.claimedAt
    }
  }

  // Legacy assignment tags → migrate to assignees
  if (Array.isArray(t.tags)) {
    const legacyTags = (t.tags as unknown[]).filter(
      (tag): tag is string => typeof tag === 'string' && isAssignmentTag(tag),
    )
    if (legacyTags.length > 0) {
      bump(counts, 'legacy_assignees')
      const migrated = legacyTags
        .map(assignmentNameFromTag)
        .filter((n): n is string => n !== null)
      const existing = Array.isArray(t.assignees)
        ? (t.assignees as unknown[]).filter((a): a is string => typeof a === 'string')
        : []
      t.assignees = [...new Set([...existing, ...migrated])]
      t.tags = (t.tags as unknown[]).filter(
        (tag) => typeof tag !== 'string' || !isAssignmentTag(tag),
      )
    }
  }

  return t
}

function repairPhaseRaw(
  raw: unknown,
  index: number,
  seenIds: Set<string>,
  counts: RepairCounts,
  gen: IdGen,
): Record<string, unknown> {
  if (!isPlainObject(raw)) {
    bump(counts, 'inferred_phase_field')
    const num = String(index + 1).padStart(2, '0')
    return {
      id: genPhaseId(index),
      num,
      name: `Phase ${num}`,
      color: '#808080',
      colorMode: 'auto',
      status: 'future',
      progress: 0,
      tasks: [],
    }
  }

  const p: Record<string, unknown> = { ...raw }

  // id: must be non-empty string
  if (typeof p.id !== 'string' || !p.id.trim()) {
    bump(counts, 'inferred_phase_field')
    p.id = genPhaseId(index)
  }

  // num: must be non-empty string
  if (typeof p.num !== 'string' || !p.num.trim()) {
    bump(counts, 'inferred_phase_field')
    p.num = String(index + 1).padStart(2, '0')
  }

  // name: must be non-empty string
  if (typeof p.name !== 'string' || !p.name.trim()) {
    bump(counts, 'inferred_phase_field')
    p.name = `Phase ${p.num}`
  }

  // color: must be non-empty string
  if (typeof p.color !== 'string' || !p.color.trim()) {
    bump(counts, 'inferred_phase_field')
    p.color = '#808080'
  }
  if (p.colorMode !== 'auto' && p.colorMode !== 'manual') {
    bump(counts, 'inferred_phase_field')
    p.colorMode = 'auto'
  }

  // status: must be a valid value
  if (typeof p.status !== 'string' || !VALID_STATUSES.has(p.status)) {
    bump(counts, 'inferred_phase_field')
    p.status = 'future'
  }

  // tasks: null → [] ; non-array → []
  if (p.tasks === null) {
    bump(counts, 'null_optional')
    p.tasks = []
  } else if (!Array.isArray(p.tasks)) {
    bump(counts, 'coerced_array')
    p.tasks = []
  }

  // Repair tasks (pass 1)
  const repairedTasks = (p.tasks as unknown[]).map((task) =>
    repairTaskRaw(task, seenIds, counts, gen),
  )
  p.tasks = repairedTasks

  // progress: recompute if invalid
  const progressOk =
    typeof p.progress === 'number' && p.progress >= 0 && p.progress <= 100
  if (!progressOk) {
    bump(counts, 'progress_recalculated')
    const total = repairedTasks.length
    const done = repairedTasks.filter((t) => t.done === true).length
    p.progress = total === 0 ? 0 : Math.round((done / total) * 100)
  }

  return p
}

function repairImportedRoadmap(
  raw: unknown,
): { repairedRaw: unknown; repairs: ImportRepair[] } {
  const counts: RepairCounts = {}
  const seenIds = new Set<string>()
  const gen = makeIdGen()

  // Determine the phases array
  let phasesArray: unknown[]
  let isTopLevelArray = false

  if (Array.isArray(raw)) {
    phasesArray = raw
    isTopLevelArray = true
  } else if (isPlainObject(raw)) {
    if (raw.phases === null) {
      bump(counts, 'null_optional')
      phasesArray = []
    } else if (!Array.isArray(raw.phases)) {
      if (raw.phases !== undefined) bump(counts, 'coerced_array')
      phasesArray = []
    } else {
      phasesArray = raw.phases as unknown[]
    }
  } else {
    // Not recoverable at top level — let validator throw
    return { repairedRaw: raw, repairs: [] }
  }

  // Pass 1: repair each phase and all tasks, collect all task IDs
  const repairedPhases = phasesArray.map((phase, i) =>
    repairPhaseRaw(phase, i, seenIds, counts, gen),
  )

  // Pass 2: remove stale parentId references
  for (const phase of repairedPhases) {
    if (Array.isArray(phase.tasks)) {
      for (const task of phase.tasks as Record<string, unknown>[]) {
        if (typeof task.parentId === 'string' && !seenIds.has(task.parentId)) {
          bump(counts, 'stale_parent_removed')
          delete task.parentId
        }
      }
    }
  }

  const repairs: ImportRepair[] = (Object.keys(counts) as ImportRepairCode[])
    .filter((code) => (counts[code] ?? 0) > 0)
    .map((code) => ({ code, message: REPAIR_MESSAGES[code] }))

  const repairedRaw = isTopLevelArray
    ? repairedPhases
    : { ...(raw as Record<string, unknown>), phases: repairedPhases }

  return { repairedRaw, repairs }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ImportedRoadmap {
  phases: Phase[]
  roadmapName?: string
  tagRegistry?: import('@/types/roadmap').TagDefinition[]
  warnings: CompatibilityWarning[]
  repairs: ImportRepair[]
}

function roadmapNameFromPayload(value: unknown): string | undefined {
  if (!isPlainObject(value)) return undefined
  const roadmap = value.roadmap
  if (!isPlainObject(roadmap)) return undefined
  return cleanOptionalText(roadmap.name, 'roadmap.name', PHASE_NAME_MAX)
}

function tagRegistryFromPayload(value: unknown): {
  registry: TagDefinition[] | undefined
  repaired: boolean
} {
  if (!isPlainObject(value)) return { registry: undefined, repaired: false }
  const raw = value.tagRegistry
  if (!Array.isArray(raw)) return { registry: undefined, repaired: false }
  const result: TagDefinition[] = []
  const ids = new Set<string>()
  const labels = new Set<string>()
  let repaired = raw.length > TAG_REGISTRY_MAX

  for (const item of raw.slice(0, TAG_REGISTRY_MAX)) {
    if (!isPlainObject(item)) {
      repaired = true
      continue
    }
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    if (id.length > TAG_ID_MAX || !TAG_ID_PATTERN.test(id) || ids.has(id)) {
      repaired = true
      continue
    }
    const rawLabel = typeof item.label === 'string' ? item.label : id
    const label = normalizeTagLabel(rawLabel)
    const labelKey = normalizedTagLabelKey(label)
    if (!label || labels.has(labelKey)) {
      repaired = true
      continue
    }
    const color = typeof item.color === 'string'
      ? normalizeTagColor(item.color)
      : undefined
    if (item.color !== undefined && color === undefined) repaired = true
    result.push({ id, label, ...(color ? { color } : {}) })
    ids.add(id)
    labels.add(labelKey)
  }
  return { registry: result, repaired }
}

/**
 * Validates and returns a clean Phase[] from an unknown import payload.
 * Accepts { phases: [...] } or [...] directly.
 * Throws on any validation failure — caller should catch and show a toast.
 */
export function validateImportedPhases(value: unknown): Phase[] {
  let raw: unknown
  if (Array.isArray(value)) {
    raw = value
  } else if (isPlainObject(value)) {
    assertNoUnsafeKeys(value)
    raw = value.phases
  } else {
    throw new Error('Expected a phase array or { phases: [...] }')
  }
  if (!Array.isArray(raw)) throw new Error('phases must be an array')
  if (raw.length > PHASES_MAX) throw new Error(`Too many phases (max ${PHASES_MAX})`)
  return (raw as unknown[]).map((p) => validatePhase(p))
}

export function validateImportedRoadmap(value: unknown): ImportedRoadmap {
  return {
    phases: validateImportedPhases(value),
    roadmapName: roadmapNameFromPayload(value),
    warnings: detectCompatibilityWarnings(value),
    repairs: [],
  }
}

export function parseImportedRoadmapJson(text: string): ImportedRoadmap {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Import failed: invalid JSON.')

  try {
    const raw = JSON.parse(trimmed)
    const warnings = detectCompatibilityWarnings(raw)
    const { repairedRaw, repairs } = repairImportedRoadmap(raw)
    const tagRegistry = tagRegistryFromPayload(raw)
    if (tagRegistry.repaired) {
      repairs.push({
        code: 'tag_registry_repaired',
        message: REPAIR_MESSAGES.tag_registry_repaired,
      })
    }
    return {
      phases: validateImportedPhases(repairedRaw),
      roadmapName: roadmapNameFromPayload(repairedRaw),
      tagRegistry: tagRegistry.registry,
      warnings,
      repairs,
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('Import failed: invalid JSON.')
    }
    if (err instanceof Error && err.message === 'phases must be an array') {
      throw new Error('Import failed: JSON must contain a phases array.')
    }
    if (err instanceof Error) {
      throw new Error(`Import failed: ${err.message}`)
    }
    throw new Error('Import failed: invalid roadmap file.')
  }
}
