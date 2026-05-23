import type { Phase, PhaseStatus, Task } from '@/types/roadmap'

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

// ─── Constants (mirrored from apps/api/src/api/schemas/limits.py) ─────────────

export const IMPORT_MAX_BYTES = 512 * 1024
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
  if (!VALID_STATUSES.has(value.status as string)) throw new Error('phase.status is invalid')
  if (typeof value.progress !== 'number' || value.progress < 0 || value.progress > 100) {
    throw new Error('phase.progress must be 0–100')
  }
  if (!Array.isArray(value.tasks)) throw new Error('phase.tasks must be an array')
  if (value.tasks.length > TASKS_PER_PHASE_MAX) {
    throw new Error(`phase has too many tasks (max ${TASKS_PER_PHASE_MAX})`)
  }
  const tasks = (value.tasks as unknown[]).map((t) => validateTask(t))
  return { id, num, name, color, status: value.status as PhaseStatus, progress: value.progress as number, tasks }
}

// ─── Compatibility detection ──────────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = 1
const KNOWN_SCHEMAS = new Set([
  'roadforge.roadmap.import',
  'roadforge.roadmap.export',
])
const KNOWN_TOP_LEVEL_KEYS = new Set([
  'schema', 'version', 'exportedAt', 'roadmap', 'collaborator', 'phases',
])
const KNOWN_PHASE_KEYS = new Set([
  'id', 'num', 'name', 'color', 'status', 'progress', 'tasks',
])
const KNOWN_TASK_KEYS = new Set([
  'id', 'title', 'done', 'next', 'est', 'tags', 'assignees', 'deps', 'desc', 'parentId',
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

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ImportedRoadmap {
  phases: Phase[]
  roadmapName?: string
  warnings: CompatibilityWarning[]
}

function roadmapNameFromPayload(value: unknown): string | undefined {
  if (!isPlainObject(value)) return undefined
  const roadmap = value.roadmap
  if (!isPlainObject(roadmap)) return undefined
  return cleanOptionalText(roadmap.name, 'roadmap.name', PHASE_NAME_MAX)
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
  }
}

export function parseImportedRoadmapJson(text: string): ImportedRoadmap {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Import failed: invalid JSON.')

  try {
    return validateImportedRoadmap(JSON.parse(trimmed))
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
