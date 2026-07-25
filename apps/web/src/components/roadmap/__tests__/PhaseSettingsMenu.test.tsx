// @vitest-environment jsdom

import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhaseSettingsMenu } from '@/components/roadmap/PhaseSettingsMenu'
import type { Phase } from '@/types/roadmap'

const phase: Phase = {
  id: 'rf-p-1',
  num: '01',
  name: 'Planning',
  color: '#ef4444',
  colorMode: 'manual',
  status: 'active',
  progress: 0,
  tasks: [],
}

function createProps(
  overrides: Partial<ComponentProps<typeof PhaseSettingsMenu>> = {},
): ComponentProps<typeof PhaseSettingsMenu> {
  return {
    phase,
    readOnly: false,
    isColorLockedByOther: false,
    showColorPicker: false,
    onRenameClick: vi.fn(),
    onColorTriggerClick: vi.fn(),
    onColorClose: vi.fn(),
    onColorSelect: vi.fn(),
    onColorModeSelect: vi.fn(),
    colorReason: 'Current phase status',
    displayColor: phase.color,
    onDeletePhase: vi.fn(),
    ...overrides,
  }
}

describe('PhaseSettingsMenu', () => {
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

  it('exposes menu semantics and focuses the first action', () => {
    act(() => root.render(<PhaseSettingsMenu {...createProps()} />))
    const trigger = container.querySelector('button') as HTMLButtonElement
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    act(() => trigger.click())

    const menu = document.body.querySelector('[role="menu"]') as HTMLElement
    const firstItem = menu.querySelector('[role="menuitem"]')
    expect(menu.getAttribute('aria-label')).toBe('Phase settings for Planning')
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id)
    expect(document.activeElement).toBe(firstItem)
  })

  it('uses dialog semantics for color controls and closes on Escape', () => {
    const onColorClose = vi.fn()
    act(() => {
      root.render(
        <PhaseSettingsMenu
          {...createProps({ showColorPicker: true, onColorClose })}
        />,
      )
    })

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('Color settings for Planning')
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }))
    })
    expect(onColorClose).toHaveBeenCalledTimes(1)
  })

  it('resynchronizes custom color when the active phase changes', () => {
    act(() => {
      root.render(
        <PhaseSettingsMenu {...createProps({ showColorPicker: true })} />,
      )
    })
    expect((document.body.querySelector(
      'input[aria-label="Custom phase hex color"]',
    ) as HTMLInputElement).value).toBe('#ef4444')

    const nextPhase = {
      ...phase,
      id: 'rf-p-2',
      name: 'Delivery',
      color: '#38bdf8',
    }
    act(() => {
      root.render(
        <PhaseSettingsMenu
          {...createProps({
            phase: nextPhase,
            displayColor: nextPhase.color,
            showColorPicker: true,
          })}
        />,
      )
    })
    expect((document.body.querySelector(
      'input[aria-label="Custom phase hex color"]',
    ) as HTMLInputElement).value).toBe('#38bdf8')
  })
})
