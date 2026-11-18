// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidePanel } from '@/components/ui/SidePanel'

function PanelHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open activity</button>
      {open && (
        <SidePanel title="Activity" onClose={() => setOpen(false)}>
          <div className="panel-body">Panel content</div>
        </SidePanel>
      )}
    </>
  )
}

describe('SidePanel', () => {
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

  it('owns dialog semantics, initial focus, Escape, and focus return', () => {
    act(() => root.render(<PanelHarness />))
    const trigger = container.querySelector('button') as HTMLButtonElement
    trigger.focus()
    act(() => trigger.click())

    const panel = container.querySelector('[role="dialog"]')
    const close = container.querySelector('[aria-label="Close Activity"]')
    expect(panel?.getAttribute('aria-labelledby')).toBe(
      panel?.querySelector('h3')?.getAttribute('id'),
    )
    expect(document.activeElement).toBe(close)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
