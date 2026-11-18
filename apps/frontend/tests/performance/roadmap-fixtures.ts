import type { Phase, TagDefinition, Task } from '@/types/roadmap'

export interface PerformanceRoadmapFixture {
  name: 'small' | 'medium' | 'large'
  roadmapName: string
  phases: Phase[]
  tagRegistry: TagDefinition[]
  taskCount: number
}

const TAG_REGISTRY: TagDefinition[] = [
  { id: 'frontend', label: 'Frontend', color: '#d97706' },
  { id: 'backend', label: 'Backend', color: '#4f7cac' },
  { id: 'quality', label: 'Quality', color: '#2f855a' },
]

function buildFixture(
  name: PerformanceRoadmapFixture['name'],
  phaseCount: number,
  tasksPerPhase: number,
): PerformanceRoadmapFixture {
  let ordinal = 0
  const phases = Array.from({ length: phaseCount }, (_, phaseIndex): Phase => {
    const phaseTasks: Task[] = Array.from({ length: tasksPerPhase }, (_, taskIndex) => {
      ordinal += 1
      const id = `RF-PERF-${String(ordinal).padStart(4, '0')}`
      const priorId = taskIndex > 0
        ? `RF-PERF-${String(ordinal - 1).padStart(4, '0')}`
        : undefined
      return {
        id,
        title: `Representative task ${ordinal} in phase ${phaseIndex + 1}`,
        done: ordinal % 5 === 0,
        next: ordinal === 1,
        est: `${(ordinal % 5) + 1}h`,
        assignees: ordinal % 3 === 0 ? ['Performance Tester'] : [],
        tags: [TAG_REGISTRY[ordinal % TAG_REGISTRY.length].id],
        deps: priorId && ordinal % 4 === 0 ? [priorId] : [],
        desc: `Deterministic performance fixture detail for task ${ordinal}. `.repeat(2),
        links: ordinal % 10 === 0
          ? [{
              id: `link-${ordinal}`,
              provider: 'url',
              kind: 'url',
              url: `https://example.com/evidence/${ordinal}`,
              label: 'Fixture evidence',
            }]
          : [],
      }
    })

    return {
      id: `rf-perf-phase-${phaseIndex + 1}`,
      num: String(phaseIndex + 1).padStart(2, '0'),
      name: `Performance phase ${phaseIndex + 1}`,
      color: phaseIndex % 2 === 0 ? '#d97706' : '#4f7cac',
      colorMode: 'auto',
      status: phaseIndex === 0 ? 'active' : 'future',
      progress: 0,
      tasks: phaseTasks,
    }
  })

  return {
    name,
    roadmapName: `${name[0].toUpperCase()}${name.slice(1)} performance roadmap`,
    phases,
    tagRegistry: structuredClone(TAG_REGISTRY),
    taskCount: phaseCount * tasksPerPhase,
  }
}

export const PERFORMANCE_ROADMAPS = {
  small: buildFixture('small', 5, 10),
  medium: buildFixture('medium', 10, 25),
  large: buildFixture('large', 20, 50),
} as const

export function importPayload(fixture: PerformanceRoadmapFixture) {
  return {
    schema: 'anvilary.roadmap.export',
    version: 1,
    roadmap: { name: fixture.roadmapName },
    phases: fixture.phases,
    tagRegistry: fixture.tagRegistry,
  }
}

export function autosyncPayload(fixture: PerformanceRoadmapFixture) {
  return {
    name: fixture.roadmapName,
    phases: fixture.phases,
    last_updated_at: '2026-07-25T18:00:00.000Z',
    tag_registry: fixture.tagRegistry,
  }
}
