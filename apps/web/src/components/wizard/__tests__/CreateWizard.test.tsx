// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateWizard } from '@/components/wizard/CreateWizard'

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
      roadmapName: 'Hidden sample title',
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

  const fillRoadmapTitle = (title = 'My roadmap') => {
    const input = container.querySelector<HTMLInputElement>('#rn')
    if (!input) throw new Error('Missing roadmap title input')
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    if (!valueSetter) throw new Error('Missing HTMLInputElement value setter')
    act(() => {
      valueSetter.call(input, title)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  const advanceToStartingPoint = () => {
    fillRoadmapTitle()
    clickButton('Continue')
  }

  const finishWizard = () => {
    clickButton('Create roadmap')
  }

  it('does not inherit the hidden sample or currently open roadmap title', () => {
    const input = container.querySelector<HTMLInputElement>('#rn')
    const continueButton = [...container.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.includes('Continue'))

    expect(input?.value).toBe('')
    expect(continueButton?.hasAttribute('disabled')).toBe(true)
  })

  it('creates an independent compact starter with its tag registry', () => {
    advanceToStartingPoint()
    clickButton('Starter example')
    finishWizard()

    expect(createLocalRoadmap).toHaveBeenCalledTimes(1)
    const [name, phases, registry] = createLocalRoadmap.mock.calls[0]
    expect(name).toBe('My roadmap')
    expect(phases).toHaveLength(3)
    expect(phases.flatMap((phase: { tasks: unknown[] }) => phase.tasks)).toHaveLength(9)
    expect(registry).toHaveLength(3)
    expect(onComplete).toHaveBeenCalledWith('local_1')
  })

  it('keeps blank creation on the canonical one-phase factory', () => {
    advanceToStartingPoint()
    finishWizard()

    const [name, phases, registry] = createLocalRoadmap.mock.calls[0]
    expect(name).toBe('My roadmap')
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
