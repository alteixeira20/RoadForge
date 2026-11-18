// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardReorder, type UseKeyboardReorderOptions } from '@/hooks/useKeyboardReorder'

type ReorderState = ReturnType<typeof useKeyboardReorder>

function Harness({
  orderedIds,
  options,
  onReady,
}: {
  orderedIds: string[]
  options: UseKeyboardReorderOptions
  onReady: (state: ReorderState) => void
}) {
  onReady(useKeyboardReorder(orderedIds, options))
  return null
}

const press = (code: string) => ({ code, preventDefault: vi.fn() })

describe('useKeyboardReorder (RF-034 preview-then-commit)', () => {
  let container: HTMLDivElement
  let root: Root
  let state: ReorderState | null
  let onCommit: ReturnType<typeof vi.fn>

  const render = (orderedIds: string[], overrides: Partial<UseKeyboardReorderOptions> = {}) => {
    act(() => {
      root.render(
        <Harness
          orderedIds={orderedIds}
          options={{
            itemLabel: (id) => id,
            onCommit,
            ...overrides,
          }}
          onReady={(value) => { state = value }}
        />,
      )
    })
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    state = null
    onCommit = vi.fn()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function current(): ReorderState {
    if (!state) throw new Error('Keyboard reorder harness did not initialize')
    return state
  }

  it('Space picks up an item and snapshots the preview order', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))

    expect(current().activeId).toBe('a')
    expect(current().previewIds).toEqual(['a', 'b', 'c'])
    expect(current().announcement).toContain('Picked up')
  })

  it('Arrow only updates the local preview - never calls onCommit', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))

    act(() => current().handleKeyDown(press('ArrowDown'), 'a'))
    expect(current().previewIds).toEqual(['b', 'a', 'c'])
    expect(onCommit).not.toHaveBeenCalled()

    act(() => current().handleKeyDown(press('ArrowDown'), 'a'))
    expect(current().previewIds).toEqual(['b', 'c', 'a'])
    expect(onCommit).not.toHaveBeenCalled()

    // A boundary move (already last) must not wrap or no-op incorrectly.
    act(() => current().handleKeyDown(press('ArrowDown'), 'a'))
    expect(current().previewIds).toEqual(['b', 'c', 'a'])
    expect(current().announcement).toContain('already at the last position')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('announces the first-position boundary without moving', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))

    act(() => current().handleKeyDown(press('ArrowUp'), 'a'))
    expect(current().previewIds).toEqual(['a', 'b', 'c'])
    expect(current().announcement).toContain('already at the first position')
  })

  it('does not commit when drop follows pickup with no move', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))
    act(() => current().handleKeyDown(press('Space'), 'a'))

    expect(onCommit).not.toHaveBeenCalled()
    expect(current().activeId).toBeNull()
    expect(current().announcement).toContain('Dropped')
  })

  it('does not commit when arrows return the item to its original position before drop', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))
    act(() => current().handleKeyDown(press('ArrowDown'), 'a'))
    act(() => current().handleKeyDown(press('ArrowUp'), 'a'))
    act(() => current().handleKeyDown(press('Space'), 'a'))

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits exactly once, with the final preview order, on drop', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))
    act(() => current().handleKeyDown(press('ArrowDown'), 'a'))
    act(() => current().handleKeyDown(press('Space'), 'a'))

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(['b', 'a', 'c'])
    expect(current().activeId).toBeNull()
    expect(current().previewIds).toBeNull()
    expect(current().announcement).toContain('Dropped')
  })

  it('Enter commits too, exactly once', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Enter'), 'a'))
    act(() => current().handleKeyDown(press('ArrowDown'), 'a'))
    act(() => current().handleKeyDown(press('Enter'), 'a'))

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(['b', 'a', 'c'])
  })

  it('Escape discards the preview with zero commits', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))
    act(() => current().handleKeyDown(press('ArrowDown'), 'a'))
    act(() => current().handleKeyDown(press('Escape'), 'a'))

    expect(onCommit).not.toHaveBeenCalled()
    expect(current().activeId).toBeNull()
    expect(current().previewIds).toBeNull()
    expect(current().announcement).toContain('cancelled')
  })

  it('external cancel() discards an active preview with zero commits', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))
    act(() => current().handleKeyDown(press('ArrowDown'), 'a'))
    act(() => current().cancel())

    expect(onCommit).not.toHaveBeenCalled()
    expect(current().activeId).toBeNull()
  })

  it('cancel() no-ops when nothing is active', () => {
    render(['a', 'b', 'c'])
    act(() => current().cancel())
    expect(current().activeId).toBeNull()
    expect(current().announcement).toBe('')
  })

  it('ignores keys for an item other than the currently active one', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))
    act(() => current().handleKeyDown(press('ArrowDown'), 'b'))

    // 'b' is not the active item - no preview change, no pickup either.
    expect(current().previewIds).toEqual(['a', 'b', 'c'])
    expect(current().activeId).toBe('a')
  })

  it('cancels automatically when the list becomes disabled mid-session', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))
    expect(current().activeId).toBe('a')

    render(['a', 'b', 'c'], { disabled: true })
    expect(current().activeId).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does not start a new session while disabled', () => {
    render(['a', 'b', 'c'], { disabled: true })
    act(() => current().handleKeyDown(press('Space'), 'a'))
    expect(current().activeId).toBeNull()
  })

  it('cancels automatically when the active item disappears from the committed order', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))

    render(['b', 'c'])
    expect(current().activeId).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('cancels automatically when an item is added elsewhere while the active item is unchanged', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))

    render(['a', 'b', 'c', 'd'])
    expect(current().activeId).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('cancels automatically when another committed item is reordered externally', () => {
    render(['a', 'b', 'c'])
    act(() => current().handleKeyDown(press('Space'), 'a'))

    // 'a' (the active item) is still present, but 'b' and 'c' swapped -
    // a collaborator's own reorder landing mid-session.
    render(['a', 'c', 'b'])
    expect(current().activeId).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('calls onSessionStart before pickup and onSessionEnd after drop', () => {
    const onSessionStart = vi.fn()
    const onSessionEnd = vi.fn()
    render(['a', 'b', 'c'], { onSessionStart, onSessionEnd })

    act(() => current().handleKeyDown(press('Space'), 'a'))
    expect(onSessionStart).toHaveBeenCalledTimes(1)
    expect(onSessionEnd).not.toHaveBeenCalled()

    act(() => current().handleKeyDown(press('Space'), 'a'))
    expect(onSessionStart).toHaveBeenCalledTimes(1)
    expect(onSessionEnd).toHaveBeenCalledTimes(1)
  })

  it('calls onAnnounce synchronously alongside every local announcement change', () => {
    const onAnnounce = vi.fn()
    render(['a', 'b', 'c'], { onAnnounce })

    act(() => current().handleKeyDown(press('Space'), 'a'))
    expect(onAnnounce).toHaveBeenLastCalledWith(expect.stringContaining('Picked up'))

    act(() => current().handleKeyDown(press('ArrowDown'), 'a'))
    expect(onAnnounce).toHaveBeenLastCalledWith(expect.stringContaining('moved to position'))

    act(() => current().handleKeyDown(press('Escape'), 'a'))
    expect(onAnnounce).toHaveBeenLastCalledWith(expect.stringContaining('cancelled'))
  })

  it('notifies onSessionEnd on unmount if a session was still active', () => {
    const onSessionEnd = vi.fn()
    render(['a', 'b', 'c'], { onSessionEnd })
    act(() => current().handleKeyDown(press('Space'), 'a'))

    act(() => root.unmount())
    expect(onSessionEnd).toHaveBeenCalledTimes(1)
  })

  it('does not call onSessionEnd on unmount if no session was active', () => {
    const onSessionEnd = vi.fn()
    render(['a', 'b', 'c'], { onSessionEnd })

    act(() => root.unmount())
    expect(onSessionEnd).not.toHaveBeenCalled()
  })
})
