import { describe, expect, it } from 'vitest'
import { filterTasks, DEFAULT_FILTER_STATE } from '@/lib/task-filters'
import { formatRoadmapMarkdown } from '@/lib/roadmap-markdown'
import { computeTaskDisplayNumbers } from '@/lib/task-display'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'
import { exportRoadmap } from '@/services/roadmap-crud.service'
import {
  autosyncPayload,
  importPayload,
  PERFORMANCE_ROADMAPS,
} from './roadmap-fixtures'

const KiB = 1024
const BUDGETS_MS = {
  hydrate: 400,
  filter: 100,
  displayNumbers: 150,
  import: 250,
  jsonExport: 250,
  markdownExport: 200,
  cacheRoundTrip: 150,
} as const
const AUTOSYNC_BUDGET_BYTES = 384 * KiB

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function measure(operation: () => void, repetitions = 7): number {
  operation()
  const durations = Array.from({ length: repetitions }, () => {
    const started = performance.now()
    operation()
    return performance.now() - started
  })
  return median(durations)
}

async function measureAsync(operation: () => Promise<unknown>, repetitions = 5): Promise<number> {
  await operation()
  const durations: number[] = []
  for (let index = 0; index < repetitions; index += 1) {
    const started = performance.now()
    await operation()
    durations.push(performance.now() - started)
  }
  return median(durations)
}

describe('representative roadmap performance budgets', () => {
  it('keeps fixture scale and autosync payloads explicit', () => {
    expect(PERFORMANCE_ROADMAPS.small.taskCount).toBe(50)
    expect(PERFORMANCE_ROADMAPS.medium.taskCount).toBe(250)
    expect(PERFORMANCE_ROADMAPS.large.taskCount).toBe(1_000)

    for (const fixture of Object.values(PERFORMANCE_ROADMAPS)) {
      const parsed = parseImportedRoadmapJson(JSON.stringify(importPayload(fixture)))
      expect(parsed.phases).toHaveLength(fixture.phases.length)
      expect(parsed.phases.flatMap((phase) => phase.tasks)).toHaveLength(fixture.taskCount)
    }

    const payloadBytes = new TextEncoder().encode(
      JSON.stringify(autosyncPayload(PERFORMANCE_ROADMAPS.large)),
    ).byteLength
    console.info(`RF-035 autosync payload: ${(payloadBytes / KiB).toFixed(1)} KiB`)
    expect(payloadBytes).toBeLessThanOrEqual(AUTOSYNC_BUDGET_BYTES)
  })

  it('measures hydration, cache, search, filter, and expansion preparation', () => {
    const fixture = PERFORMANCE_ROADMAPS.large
    const serialized = JSON.stringify(importPayload(fixture))
    const metrics = {
      hydrate: measure(() => upgradeRoadmapSnapshot(JSON.parse(serialized))),
      cacheRoundTrip: measure(() => JSON.parse(JSON.stringify(autosyncPayload(fixture)))),
      filter: measure(() => filterTasks(
        fixture.phases,
        { ...DEFAULT_FILTER_STATE, query: 'representative task' },
        { displayName: 'Performance Tester', participantId: null },
      )),
      displayNumbers: measure(() => computeTaskDisplayNumbers(fixture.phases)),
    }

    console.info(`RF-035 CPU metrics (median ms): ${JSON.stringify(metrics)}`)
    expect(metrics.hydrate).toBeLessThanOrEqual(BUDGETS_MS.hydrate)
    expect(metrics.cacheRoundTrip).toBeLessThanOrEqual(BUDGETS_MS.cacheRoundTrip)
    expect(metrics.filter).toBeLessThanOrEqual(BUDGETS_MS.filter)
    expect(metrics.displayNumbers).toBeLessThanOrEqual(BUDGETS_MS.displayNumbers)
  })

  it('measures parser-backed import and portable exports', async () => {
    const fixture = PERFORMANCE_ROADMAPS.large
    const serialized = JSON.stringify(importPayload(fixture))
    const metrics = {
      import: measure(() => parseImportedRoadmapJson(serialized)),
      jsonExport: await measureAsync(async () => {
        await exportRoadmap(fixture.phases, 'json', {
          roadmapName: fixture.roadmapName,
          tagRegistry: fixture.tagRegistry,
        })
      }),
      markdownExport: measure(() => formatRoadmapMarkdown({
        roadmapName: fixture.roadmapName,
        phases: fixture.phases,
        tagRegistry: fixture.tagRegistry,
      })),
    }

    console.info(`RF-035 portability metrics (median ms): ${JSON.stringify(metrics)}`)
    expect(metrics.import).toBeLessThanOrEqual(BUDGETS_MS.import)
    expect(metrics.jsonExport).toBeLessThanOrEqual(BUDGETS_MS.jsonExport)
    expect(metrics.markdownExport).toBeLessThanOrEqual(BUDGETS_MS.markdownExport)
  })
})
