// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ColorSwatchButton } from '@/components/ui/ColorSwatchButton'

describe('ColorSwatchButton', () => {
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

  it('exposes an accessible name and dialog popup semantics, not native color-input chrome', () => {
    act(() => {
      root.render(
        <ColorSwatchButton color="#a855f7" label="Change color for Infra" onClick={vi.fn()} />,
      )
    })
    const button = container.querySelector('button')!
    expect(button.tagName).toBe('BUTTON')
    expect(container.querySelector('input')).toBeNull()
    expect(button.getAttribute('aria-label')).toBe('Change color for Infra')
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
  })

  it('renders the visible dot as aria-hidden and colored via the swatch value', () => {
    act(() => {
      root.render(
        <ColorSwatchButton color="#a855f7" label="Change color for Infra" onClick={vi.fn()} />,
      )
    })
    const dot = container.querySelector('.color-swatch-button-dot')!
    expect(dot.getAttribute('aria-hidden')).toBe('true')
    expect((dot as HTMLElement).style.backgroundColor).toBe('rgb(168, 85, 247)')
  })

  it('reflects open state via aria-expanded and aria-controls', () => {
    act(() => {
      root.render(
        <ColorSwatchButton
          color="#a855f7"
          label="Change color for Infra"
          expanded
          controls="color-dialog-1"
          onClick={vi.fn()}
        />,
      )
    })
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-controls')).toBe('color-dialog-1')
  })

  it('invokes the click handler', () => {
    const onClick = vi.fn()
    act(() => {
      root.render(
        <ColorSwatchButton color="#a855f7" label="Change color for Infra" onClick={onClick} />,
      )
    })
    act(() => container.querySelector<HTMLButtonElement>('button')!.click())
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
