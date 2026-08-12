import { computeTaskDisplayNumbers } from '@/lib/task-display'
import { getTaskComplexity } from '@/lib/task-complexity'
import type { Phase, TaskComplexity, TaskExternalLink } from '@/types/roadmap'

export const PORTABLE_ROADMAP_SCHEMA_VERSION = 2

interface PortableTask {
  title: string
  done: boolean
  recommended?: boolean
  est?: string
  complexity: TaskComplexity
  tags?: string[]
  assignees?: string[]
  deps?: string[]
  desc?: string
  parent?: string
  links?: TaskExternalLink[]
}

export interface PortablePhase {
  id: string
  num: string
  name: string
  color: string
  colorMode?: Phase['colorMode']
  status: Phase['status']
  progress: number
  tasks: PortableTask[]
}

/**
 * Build the user-facing portable roadmap representation from an explicit
 * allowlist of portable fields.
 *
 * Task identity in portable JSON is the same order-derived number users see in
 * the workspace (1.1, 1.2, 1.1.1, ...). Opaque internal IDs remain an
 * implementation detail so reordering cannot corrupt live collaboration state.
 */
export function toPortablePhases(phases: Phase[]): PortablePhase[] {
  const refs = computeTaskDisplayNumbers(phases)

  return phases.map((phase) => ({
    id: phase.id,
    num: phase.num,
    name: phase.name,
    color: phase.color,
    ...(phase.colorMode ? { colorMode: phase.colorMode } : {}),
    status: phase.status,
    progress: phase.progress,
    tasks: phase.tasks.map((task) => {
      const dependencyRefs = task.deps
        ?.map((dependencyId) => refs.get(dependencyId))
        .filter((ref): ref is string => Boolean(ref))
      const parentRef = task.parentId ? refs.get(task.parentId) : undefined

      return {
        title: task.title,
        done: task.done,
        ...(task.next !== undefined ? { recommended: task.next } : {}),
        ...(task.est !== undefined ? { est: task.est } : {}),
        complexity: getTaskComplexity(task),
        ...(task.tags !== undefined ? { tags: [...task.tags] } : {}),
        ...(task.assignees !== undefined ? { assignees: [...task.assignees] } : {}),
        ...(task.deps !== undefined ? { deps: dependencyRefs ?? [] } : {}),
        ...(task.desc !== undefined ? { desc: task.desc } : {}),
        ...(parentRef ? { parent: parentRef } : {}),
        ...(task.links !== undefined ? { links: task.links.map((link) => ({ ...link })) } : {}),
      }
    }),
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPortableV2(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || value.version !== PORTABLE_ROADMAP_SCHEMA_VERSION) return false
  return value.schema === 'roadforge.roadmap.import'
    || value.schema === 'roadforge.roadmap.export'
}

/**
 * Convert portable v2 order references into opaque internal IDs before the
 * existing import repair/validation pipeline runs. Legacy v1 ID-based files are
 * returned unchanged. Any user-supplied `id` in a v2 task is overwritten, so
 * task identity cannot be customized through the portable format.
 */
export function normalizePortableRoadmapForImport(value: unknown): unknown {
  if (!isPortableV2(value) || !Array.isArray(value.phases)) return value

  const refToInternalId = new Map<string, string>()
  const taskRefsByPhase = new Map<number, string[]>()

  // Pass 1 builds one roadmap-wide positional identity map so dependencies can
  // point across phase boundaries (for example 2.1 depending on 1.2).
  value.phases.forEach((rawPhase, phaseIndex) => {
    if (!isRecord(rawPhase) || !Array.isArray(rawPhase.tasks)) return

    const phaseNumber = typeof rawPhase.num === 'string'
      ? Number.parseInt(rawPhase.num, 10)
      : Number.NaN
    const phaseRef = Number.isFinite(phaseNumber) ? phaseNumber : phaseIndex + 1
    const taskRefs: string[] = []
    let topLevelCount = 0
    const childCounts = new Map<string, number>()

    rawPhase.tasks.forEach((rawTask, taskIndex) => {
      if (!isRecord(rawTask)) {
        taskRefs.push(`${phaseRef}.${taskIndex + 1}`)
        return
      }

      const parent = typeof rawTask.parent === 'string' ? rawTask.parent.trim() : ''
      let taskRef: string
      if (parent) {
        const childIndex = (childCounts.get(parent) ?? 0) + 1
        childCounts.set(parent, childIndex)
        taskRef = `${parent}.${childIndex}`
      } else {
        topLevelCount += 1
        taskRef = `${phaseRef}.${topLevelCount}`
      }

      taskRefs.push(taskRef)
      refToInternalId.set(taskRef, `rf-t-v2-${phaseIndex + 1}-${taskIndex + 1}`)
    })

    taskRefsByPhase.set(phaseIndex, taskRefs)
  })

  // Pass 2 resolves positional parent/dependency references only after the full
  // roadmap map exists.
  const phases = value.phases.map((rawPhase, phaseIndex) => {
    if (!isRecord(rawPhase) || !Array.isArray(rawPhase.tasks)) return rawPhase
    const taskRefs = taskRefsByPhase.get(phaseIndex) ?? []

    const tasks = rawPhase.tasks.map((rawTask, taskIndex) => {
      if (!isRecord(rawTask)) return rawTask

      const task = { ...rawTask }
      const taskRef = taskRefs[taskIndex]
      task.id = refToInternalId.get(taskRef) ?? `rf-t-v2-${phaseIndex + 1}-${taskIndex + 1}`

      if (task.recommended !== undefined) task.next = task.recommended
      delete task.recommended

      if (typeof task.parent === 'string') {
        const parentRef = task.parent.trim()
        task.parentId = refToInternalId.get(parentRef) ?? parentRef
      }
      delete task.parent

      if (Array.isArray(task.deps)) {
        task.deps = task.deps.map((dependency) => {
          if (typeof dependency !== 'string') return dependency
          const dependencyRef = dependency.trim()
          return refToInternalId.get(dependencyRef) ?? dependencyRef
        })
      }

      return task
    })

    return { ...rawPhase, tasks }
  })

  return { ...value, phases }
}
