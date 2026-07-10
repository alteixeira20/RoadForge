// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdleEditPause } from '@/hooks/useIdleEditPause'

type IdlePauseApi = ReturnType<typeof useIdleEditPause>

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

function Harness({
  onApi,
  timeoutMs,
}: {
  onApi: (api: IdlePauseApi) => void
  timeoutMs: number
}) {
  const api = useIdleEditPause({ active: true, timeoutMs })
  onApi(api)
  return null
}

describe('useIdleEditPause', () => {
  it('does not re-render on repeated interactions while active (the caret-loss root cause)', () => {
    let renderCount = 0
    let latestApi: IdlePauseApi | null = null
    act(() => {
      root.render(
        React.createElement(Harness, {
          timeoutMs: 1000,
          onApi: (api) => {
            renderCount += 1
            latestApi = api
          },
        }),
      )
    })
    expect(renderCount).toBe(1)

    for (let i = 0; i < 20; i++) {
      act(() => {
        latestApi!.recordInteraction()
      })
    }

    // Every keystroke calls recordInteraction; none of them may force a
    // re-render, otherwise the parent (TaskRow) would remount the form
    // mid-typing and drop characters / reset the caret.
    expect(renderCount).toBe(1)
    expect(latestApi!.isIdlePaused).toBe(false)
  })

  it('pauses after the idle timeout elapses with no interaction, causing exactly one re-render', () => {
    let renderCount = 0
    let latestApi: IdlePauseApi | null = null
    act(() => {
      root.render(
        React.createElement(Harness, {
          timeoutMs: 1000,
          onApi: (api) => {
            renderCount += 1
            latestApi = api
          },
        }),
      )
    })
    const countAfterMount = renderCount

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(latestApi!.isIdlePaused).toBe(true)
    expect(renderCount).toBe(countAfterMount + 1)
  })

  it('resumeEditing clears the paused state', () => {
    let latestApi: IdlePauseApi | null = null
    act(() => {
      root.render(
        React.createElement(Harness, {
          timeoutMs: 1000,
          onApi: (api) => {
            latestApi = api
          },
        }),
      )
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(latestApi!.isIdlePaused).toBe(true)

    act(() => {
      latestApi!.resumeEditing()
    })
    expect(latestApi!.isIdlePaused).toBe(false)
  })
})

describe('typing through a live input driven by recordInteraction', () => {
  function InputHarness({
    onMount,
  }: {
    onMount: (input: HTMLInputElement, api: IdlePauseApi) => void
  }) {
    const [value, setValue] = React.useState('')
    const api = useIdleEditPause({ active: true, timeoutMs: 90_000 })
    return React.createElement('input', {
      ref: (node: HTMLInputElement | null) => {
        if (node) onMount(node, api)
      },
      value,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        api.recordInteraction()
        setValue(e.target.value)
      },
    })
  }

  function typeInto(input: HTMLInputElement, value: string, selectionEnd?: number) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      if (selectionEnd !== undefined) {
        input.setSelectionRange(selectionEnd, selectionEnd)
      }
    })
  }

  it('preserves the exact value across repeated keystrokes without remounting the input', () => {
    let inputEl: HTMLInputElement | null = null
    act(() => {
      root.render(
        React.createElement(InputHarness, {
          onMount: (node) => {
            inputEl = node
          },
        }),
      )
    })
    const firstNode = inputEl

    const text = 'hello world'
    for (let i = 1; i <= text.length; i++) {
      typeInto(inputEl!, text.slice(0, i))
    }

    expect(inputEl).toBe(firstNode)
    expect(inputEl!.value).toBe(text)
  })

  it('preserves caret position when editing in the middle of existing text', () => {
    let inputEl: HTMLInputElement | null = null
    act(() => {
      root.render(
        React.createElement(InputHarness, {
          onMount: (node) => {
            inputEl = node
          },
        }),
      )
    })
    const firstNode = inputEl

    typeInto(inputEl!, 'hello world')
    // Insert "X" after "hello" (index 5), caret should land right after it.
    typeInto(inputEl!, 'helloX world', 6)

    expect(inputEl).toBe(firstNode)
    expect(inputEl!.value).toBe('helloX world')
    expect(inputEl!.selectionStart).toBe(6)
  })
})
