// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateWizard } from '@/components/wizard/CreateWizard'

// Cross-checked against the canonical file's own declared counts, rather
// than a hand-maintained number that goes stale every time
// docs/roadforge-roadmap.json is updated.
function readCanonicalRoadmapMeta() {
  // `new URL(..., import.meta.url)` is unreliable under the jsdom test
  // environment this file opts into (jsdom shims module-URL resolution), so
  // resolve from the working directory (apps/web) instead.
  const raw = JSON.parse(readFileSync(
    join(process.cwd(), '../../docs/roadforge-roadmap.json'),
    'utf8',
  )) as { meta: { phaseCount: number; taskCount: number } }
  return raw.meta
}

const { mockedUseRoadmap } = vi.hoisted(() => ({
  mockedUseRoadmap: vi.fn(),
}))

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmap: mockedUseRoadmap,
}))

describe('CreateWizard starting point', () => {
  let container: HTMLDivElement
  let root: Root
  let createLocalRoadmap: ReturnType<typeof vi.fn>
  let onComplete: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createLocalRoadmap = vi.fn().mockReturnValue('local_1')
    onComplete = vi.fn()
    mockedUseRoadmap.mockReturnValue({
      displayName: 'Alex',
      setDisplayName: vi.fn(),
      roadmapName: 'My roadmap',
      createLocalRoadmap,
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(<CreateWizard onComplete={onComplete} onClose={vi.fn()} />)
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const clickButton = (label: string) => {
    const button = [...container.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.includes(label))
    if (!button) throw new Error(`Missing button: ${label}`)
    act(() => button.click())
  }

  const advanceToStartingPoint = () => {
    clickButton('Continue')
    clickButton('Continue')
  }

  const finishWizard = () => {
    clickButton('Continue')
    clickButton('Continue')
    clickButton('Open roadmap')
  }

  it('creates an independent canonical template with its tag registry', () => {
    advanceToStartingPoint()
    clickButton('Use RoadForge template')
    finishWizard()

    expect(createLocalRoadmap).toHaveBeenCalledTimes(1)
    const [name, phases, registry] = createLocalRoadmap.mock.calls[0]
    const canonicalRoadmapMeta = readCanonicalRoadmapMeta()
    expect(name).toBe('My roadmap')
    expect(phases).toHaveLength(canonicalRoadmapMeta.phaseCount)
    expect(phases.flatMap((phase: { tasks: unknown[] }) => phase.tasks))
      .toHaveLength(canonicalRoadmapMeta.taskCount)
    expect(registry.length).toBeGreaterThan(0)
    expect(onComplete).toHaveBeenCalledWith('local_1')
  })

  it('keeps blank creation on the canonical one-phase factory', () => {
    advanceToStartingPoint()
    finishWizard()

    const [, phases, registry] = createLocalRoadmap.mock.calls[0]
    expect(phases).toHaveLength(1)
    expect(phases[0]).toMatchObject({
      num: '01',
      name: 'Planning',
      progress: 0,
      tasks: [],
    })
    expect(registry).toBeUndefined()
  })
})
