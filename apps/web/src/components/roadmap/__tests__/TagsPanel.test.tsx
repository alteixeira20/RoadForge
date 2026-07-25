// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TagsPanel } from '@/components/roadmap/TagsPanel'
import type { Phase, TagDefinition } from '@/types/roadmap'

const roadmapContext = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}))

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmap: () => roadmapContext.current,
}))

const tagRegistry: TagDefinition[] = [
  { id: 'unused', label: 'Unused', color: '#d97706' },
  { id: 'single', label: 'Single', color: '#059669' },
  { id: 'shared', label: 'Shared', color: '#0891b2' },
]

const phases: Phase[] = [
  {
    id: 'phase-1',
    num: '01',
    name: 'Planning',
    color: '#d97706',
    colorMode: 'auto',
    status: 'active',
    progress: 0,
    tasks: [
      { id: 'task-1', title: 'One', done: false, tags: ['single', 'shared'] },
      { id: 'task-2', title: 'Two', done: false, tags: ['shared'] },
    ],
  },
]

describe('TagsPanel', () => {
  let container: HTMLDivElement
  let root: Root
  let setTagRegistry: ReturnType<typeof vi.fn>
  let setSaved: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setTagRegistry = vi.fn()
    setSaved = vi.fn()
    roadmapContext.current = {
      tagRegistry,
      phases,
      setTagRegistry,
      setSaved,
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows canonical previews and exact usage wording', () => {
    act(() => root.render(<TagsPanel />))

    expect(container.querySelectorAll('.tag-chip')).toHaveLength(3)
    expect(
      Array.from(container.querySelectorAll('.tag-registry-usage')).map(
        (item) => item.textContent,
      ),
    ).toEqual(['Not used', '1 task', '2 tasks'])
  })

  it('keeps viewer tag state read-only', () => {
    act(() => root.render(<TagsPanel readOnly />))

    expect(container.textContent).toContain('Tag management is read-only')
    expect(container.querySelector('button')).toBeNull()
  })

  it('creates tags through the existing registry setter path', () => {
    act(() => root.render(<TagsPanel />))
    const newTag = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('New tag'),
    )!
    act(() => newTag.click())

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="New tag label"]',
    )!
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(input, 'Release risk')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const add = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Add',
    )!
    act(() => add.click())

    expect(setTagRegistry).toHaveBeenCalledWith([
      ...tagRegistry,
      expect.objectContaining({
        id: 'release-risk',
        label: 'Release risk',
        color: '#d97706',
      }),
    ])
    expect(setSaved).toHaveBeenCalledWith(false)
  })

  it('edits and recolors through the existing registry setter path', () => {
    act(() => root.render(<TagsPanel />))
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Edit tag Unused"]',
        )!
        .click()
    })

    const label = container.querySelector<HTMLInputElement>(
      'input[aria-label="Tag label for Unused"]',
    )!
    const color = container.querySelector<HTMLInputElement>(
      'input[aria-label="Tag color for Unused"]',
    )!
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(label, 'Updated')
      label.dispatchEvent(new Event('input', { bubbles: true }))
      setter.call(color, '#9333ea')
      color.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Save',
      )!.click()
    })

    expect(setTagRegistry).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'unused',
        label: 'Updated',
        color: '#9333ea',
      }),
      tagRegistry[1],
      tagRegistry[2],
    ])
    expect(setSaved).toHaveBeenCalledWith(false)
  })

  it('deletes an unused tag through the existing registry setter path', () => {
    act(() => root.render(<TagsPanel />))
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Delete tag Unused"]',
        )!
        .click()
    })

    const dialog = document.body.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('Delete the unused tag "Unused"?')
    act(() => {
      Array.from(dialog.querySelectorAll('button')).find(
        (button) => button.textContent === 'Delete tag',
      )!.click()
    })

    expect(setTagRegistry).toHaveBeenCalledWith(tagRegistry.slice(1))
    expect(setSaved).toHaveBeenCalledWith(false)
  })
})
