// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  canRestoreFocus,
  trapDialogTabFocus,
} from '@/lib/dialog-focus'

afterEach(() => {
  document.body.replaceChildren()
})

describe('dialog focus helpers', () => {
  it('recognizes only connected and usable focus-restoration targets', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)

    expect(canRestoreFocus(button)).toBe(true)

    button.disabled = true
    expect(canRestoreFocus(button)).toBe(false)

    button.disabled = false
    button.remove()
    expect(canRestoreFocus(button)).toBe(false)
  })

  it('wraps focus from the last control to the first control', () => {
    const dialog = document.createElement('div')
    dialog.tabIndex = -1

    const first = document.createElement('button')
    const last = document.createElement('button')
    dialog.append(first, last)
    document.body.appendChild(dialog)

    last.focus()

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    trapDialogTabFocus(event, dialog)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
  })
})
