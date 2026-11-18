// @vitest-environment jsdom

import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AnchoredOverlay,
  calculateAnchoredOverlayPosition,
} from '@/components/ui/AnchoredOverlay'

function OverlayHarness({ role = 'menu' }: { role?: 'menu' | 'dialog' }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  return (
    <>
      <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>
        Open overlay
      </button>
      <AnchoredOverlay
        open={open}
        anchorRef={anchorRef}
        role={role}
        ariaLabel="Test overlay"
        className="test-overlay"
        onClose={() => setOpen(false)}
      >
        <button type="button" role={role === 'menu' ? 'menuitem' : undefined}>
          First
        </button>
        <button type="button" role={role === 'menu' ? 'menuitem' : undefined}>
          Second
        </button>
      </AnchoredOverlay>
      <button type="button">After overlay</button>
    </>
  )
}

describe('calculateAnchoredOverlayPosition', () => {
  it('flips above the anchor when the lower viewport cannot fit the overlay', () => {
    expect(calculateAnchoredOverlayPosition({
      anchor: { top: 170, right: 290, bottom: 190, left: 270 },
      overlayWidth: 120,
      overlayHeight: 80,
      viewportWidth: 300,
      viewportHeight: 200,
    })).toEqual({
      top: 84,
      left: 170,
      maxHeight: 156,
      side: 'top',
    })
  })

  it('clamps horizontal placement inside the viewport', () => {
    expect(calculateAnchoredOverlayPosition({
      anchor: { top: 20, right: 295, bottom: 40, left: 275 },
      overlayWidth: 200,
      overlayHeight: 60,
      viewportWidth: 300,
      viewportHeight: 200,
    }).left).toBe(92)

    expect(calculateAnchoredOverlayPosition({
      anchor: { top: 20, right: 25, bottom: 40, left: 5 },
      overlayWidth: 160,
      overlayHeight: 60,
      viewportWidth: 300,
      viewportHeight: 200,
      alignment: 'start',
    }).left).toBe(8)
  })
})

describe('AnchoredOverlay interactions', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('portals a menu, supports arrow navigation and Escape, and returns focus', () => {
    act(() => root.render(<OverlayHarness />))
    const trigger = container.querySelector('button') as HTMLButtonElement
    act(() => trigger.click())

    const menu = document.body.querySelector('[role="menu"]') as HTMLElement
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    expect(menu).toBeInstanceOf(HTMLElement)
    expect(document.activeElement).toBe(items[0])

    act(() => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
      }))
    })
    expect(document.activeElement).toBe(items[1])

    trigger.focus()
    act(() => {
      menu.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true,
      }))
    })
    expect(document.activeElement).toBe(items[1])

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }))
    })
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('dismisses on an outside pointer interaction without stealing its focus', () => {
    act(() => root.render(<OverlayHarness />))
    const trigger = container.querySelector('button') as HTMLButtonElement
    const outsideTarget = Array.from(container.querySelectorAll('button')).at(-1) as HTMLButtonElement
    act(() => trigger.click())
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()

    act(() => {
      outsideTarget.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      outsideTarget.focus()
    })
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(outsideTarget)
  })

  it('closes a menu on Tab and continues in page order', async () => {
    act(() => root.render(<OverlayHarness />))
    const trigger = container.querySelector('button') as HTMLButtonElement
    const afterOverlay = Array.from(container.querySelectorAll('button')).at(-1) as HTMLButtonElement
    act(() => trigger.click())
    const menu = document.body.querySelector('[role="menu"]') as HTMLElement
    const firstItem = menu.querySelector('[role="menuitem"]') as HTMLButtonElement

    await act(async () => {
      firstItem.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
      }))
      await Promise.resolve()
    })

    expect(document.body.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(afterOverlay)
  })

  it('repositions after viewport resize and scroll events', () => {
    vi.stubGlobal('innerWidth', 300)
    vi.stubGlobal('innerHeight', 800)
    let anchorRect = {
      top: 20,
      right: 290,
      bottom: 40,
      left: 270,
    }
    act(() => root.render(<OverlayHarness />))
    const trigger = container.querySelector('button') as HTMLButtonElement
    trigger.getBoundingClientRect = () => ({
      ...anchorRect,
      width: 20,
      height: 20,
      x: anchorRect.left,
      y: anchorRect.top,
      toJSON: () => ({}),
    })
    act(() => trigger.click())
    const menu = document.body.querySelector('[role="menu"]') as HTMLElement
    menu.getBoundingClientRect = () => ({
      top: 0,
      right: 100,
      bottom: 60,
      left: 0,
      width: 100,
      height: 60,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    act(() => window.dispatchEvent(new Event('resize')))
    expect(menu.style.left).toBe('190px')
    expect(menu.dataset.side).toBe('bottom')

    anchorRect = { top: 740, right: 290, bottom: 760, left: 270 }
    act(() => document.dispatchEvent(new Event('scroll')))
    expect(menu.dataset.side).toBe('top')
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(anchorRect.top)
  })

  it('traps Tab focus within a dialog popover', () => {
    act(() => root.render(<OverlayHarness role="dialog" />))
    const trigger = container.querySelector('button') as HTMLButtonElement
    act(() => trigger.click())
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const buttons = Array.from(dialog.querySelectorAll('button'))
    buttons[1].focus()

    act(() => {
      buttons[1].dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
      }))
    })
    expect(document.activeElement).toBe(buttons[0])
  })
})
