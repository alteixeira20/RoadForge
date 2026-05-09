import type { Phase, PhaseStatus, Task } from '@/types/roadmap'

// ─── Constants (mirrored from apps/api/src/api/schemas/limits.py) ─────────────

export const IMPORT_MAX_BYTES = 512 * 1024
const PHASES_MAX = 50
const TASKS_PER_PHASE_MAX = 200
const TASK_TITLE_MAX = 160
const TASK_DESC_MAX = 2_000
const TASK_EST_MAX = 64
const TASK_TAGS_MAX = 20
const TASK_DEPS_MAX = 50
const TAG_MAX = 40
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
  const deps = validateStringArray(value.deps, 'task.deps', TASK_DEPS_MAX, ID_MAX)
  if (deps !== undefined) task.deps = deps
  const desc = cleanOptionalText(value.desc, 'task.desc', TASK_DESC_MAX)
  if (desc !== undefined) task.desc = desc
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

// ─── Public API ───────────────────────────────────────────────────────────────

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
