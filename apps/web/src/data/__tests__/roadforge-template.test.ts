import { describe, expect, it } from 'vitest'
import { createRoadForgeTemplate } from '@/data/roadforge-template'

describe('createRoadForgeTemplate', () => {
  it('returns the canonical roadmap through the real parser', () => {
    const template = createRoadForgeTemplate()
    const tasks = template.phases.flatMap((phase) => phase.tasks)

    expect(Object.keys(template).sort()).toEqual([
      'phases',
      'roadmapName',
      'tagRegistry',
    ])
    expect(template.roadmapName).toBe('RoadForge - Clean Beta Foundation')
    expect(template.phases).toHaveLength(11)
    expect(tasks).toHaveLength(40)
    expect(tasks.filter((task) => task.next)).toHaveLength(1)
    expect(template.tagRegistry.length).toBeGreaterThan(0)
  })

  it('deep-clones every selection and never exposes mutable source data', () => {
    const first = createRoadForgeTemplate()
    const originalName = first.phases[0].name
    const originalTitle = first.phases[0].tasks[0].title
    const originalTagLabel = first.tagRegistry[0].label

    first.phases[0].name = 'Mutated phase'
    first.phases[0].tasks[0].title = 'Mutated task'
    first.tagRegistry[0].label = 'Mutated tag'

    const second = createRoadForgeTemplate()
    expect(second.phases[0].name).toBe(originalName)
    expect(second.phases[0].tasks[0].title).toBe(originalTitle)
    expect(second.tagRegistry[0].label).toBe(originalTagLabel)
    expect(second.phases).not.toBe(first.phases)
    expect(second.phases[0].tasks).not.toBe(first.phases[0].tasks)
    expect(second.tagRegistry).not.toBe(first.tagRegistry)
  })
})
