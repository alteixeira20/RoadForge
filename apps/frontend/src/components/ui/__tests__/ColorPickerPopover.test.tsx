// @vitest-environment jsdom

import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ColorPickerPopover } from '@/components/ui/ColorPickerPopover'

function Harness({
  open,
  value,
  onSelect,
  onClose,
  showPicker = true,
  header,
}: {
  open: boolean
  value: string
  onSelect: (color: string) => void
  onClose: () => void
  showPicker?: boolean
  header?: React.ReactNode
}) {
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  return (
    <>
      <button ref={anchorRef} type="button">
        Anchor
      </button>
      <ColorPickerPopover
        open={open}
        anchorRef={anchorRef}
        ariaLabel="Test color picker"
        value={value}
        onSelect={onSelect}
        onClose={onClose}
        showPicker={showPicker}
        header={header}
      />
    </>
  )
}

describe('ColorPickerPopover', () => {
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

  it('renders the shared preset grid with the current value marked selected', () => {
    const onSelect = vi.fn()
    act(() => {
      root.render(
        <Harness open value="#22c55e" onSelect={onSelect} onClose={vi.fn()} />,
      )
    })
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.querySelector('.color-picker-presets')).not.toBeNull()

    const green = dialog.querySelector<HTMLButtonElement>('button[aria-label="Green"]')!
    expect(green.getAttribute('aria-pressed')).toBe('true')
    const purple = dialog.querySelector<HTMLButtonElement>('button[aria-label="Purple"]')!
    expect(purple.getAttribute('aria-pressed')).toBe('false')

    act(() => purple.click())
    expect(onSelect).toHaveBeenCalledWith('#a855f7')
  })

  it('validates the custom hex field, disabling Apply until it is a valid color', () => {
    const onSelect = vi.fn()
    act(() => {
      root.render(
        <Harness open value="#22c55e" onSelect={onSelect} onClose={vi.fn()} />,
      )
    })
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    const hexInput = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="Custom hex color"]',
    )!
    const applyButton = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Apply',
    )!
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!

    act(() => {
      setter.call(hexInput, 'not-a-color')
      hexInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(applyButton.disabled).toBe(true)
    expect(hexInput.getAttribute('aria-invalid')).toBe('true')
    expect(dialog.querySelector('.color-picker-hint')?.textContent).toMatch(/hex color/i)

    act(() => {
      setter.call(hexInput, '#123ABC')
      hexInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(applyButton.disabled).toBe(false)
    expect(hexInput.getAttribute('aria-invalid')).toBe('false')

    act(() => applyButton.click())
    expect(onSelect).toHaveBeenCalledWith('#123abc')
  })

  it('resyncs the custom field to the current value when it changes while open', () => {
    act(() => {
      root.render(
        <Harness open value="#22c55e" onSelect={vi.fn()} onClose={vi.fn()} />,
      )
    })
    const getHexInput = () =>
      document.body.querySelector<HTMLInputElement>(
        'input[aria-label="Custom hex color"]',
      )!
    expect(getHexInput().value).toBe('#22c55e')

    act(() => {
      root.render(
        <Harness open value="#38bdf8" onSelect={vi.fn()} onClose={vi.fn()} />,
      )
    })
    expect(getHexInput().value).toBe('#38bdf8')
  })

  it('renders only the header and hides the preset/custom body when showPicker is false', () => {
    act(() => {
      root.render(
        <Harness
          open
          value="#22c55e"
          onSelect={vi.fn()}
          onClose={vi.fn()}
          showPicker={false}
          header={<p>Auto mode explanation</p>}
        />,
      )
    })
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('Auto mode explanation')
    expect(dialog.querySelector('.color-picker-presets')).toBeNull()
    expect(dialog.querySelector('.color-picker-custom')).toBeNull()
  })

  it('closes on Escape and returns focus to the anchor', () => {
    const onClose = vi.fn()
    act(() => {
      root.render(
        <Harness open value="#22c55e" onSelect={vi.fn()} onClose={onClose} />,
      )
    })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
