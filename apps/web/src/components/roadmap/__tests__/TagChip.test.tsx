// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TagChip } from '@/components/roadmap/TagChip'
import { fallbackTagColor } from '@/lib/tag-registry'
import type { TagDefinition } from '@/types/roadmap'

const registry: TagDefinition[] = [
  { id: 'orange', label: 'Orange', color: '#d97706' },
  { id: 'green', label: 'Green', color: '#059669' },
  { id: 'cyan', label: 'Cyan', color: '#0891b2' },
  { id: 'purple', label: 'Purple', color: '#9333ea' },
  { id: 'red', label: 'Red', color: '#dc2626' },
  { id: 'light', label: 'Very light', color: '#fefefe' },
  { id: 'dark', label: 'Very dark', color: '#010101' },
  { id: 'invalid', label: 'Invalid', color: 'orange' },
  { id: 'missing', label: 'Missing' },
]

describe('TagChip', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('uses one chip contract for representative and extreme colors', () => {
    act(() => {
      root.render(
        <>
          {registry.map((tag) => (
            <TagChip key={tag.id} tagId={tag.id} registry={registry} />
          ))}
        </>,
      )
    })

    const chips = Array.from(container.querySelectorAll<HTMLElement>('.tag-chip'))
    expect(chips.map((chip) => chip.textContent)).toEqual(
      registry.map((tag) => tag.label),
    )
    expect(
      chips.slice(0, 7).map((chip) => chip.style.getPropertyValue('--tag-color')),
    ).toEqual(registry.slice(0, 7).map((tag) => tag.color))
    expect(chips[7].style.getPropertyValue('--tag-color')).toBe(
      fallbackTagColor('invalid'),
    )
    expect(chips[8].style.getPropertyValue('--tag-color')).toBe(
      fallbackTagColor('missing'),
    )
    chips.forEach((chip) => {
      expect(chip.getAttribute('title')).toBe(chip.textContent)
    })
  })
})
