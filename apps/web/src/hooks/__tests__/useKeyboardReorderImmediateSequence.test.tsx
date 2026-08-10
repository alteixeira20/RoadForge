// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardReorder } from '@/hooks/useKeyboardReorder'

type ReorderState = ReturnType<typeof useKeyboardReorder>

function Harness({
  onReady,
  onCommit,
  onAnnounce,
}: {
  onReady: (state: ReorderState) => void
  onCommit: (orderedIds: string[]) => void
  onAnnounce: (message: string) => void
}) {
  onReady(useKeyboardReorder(['task-a', 'task-b'], {
    itemLabel: (id) => id === 'task-a' ? 'task A' : 'task B',
    onCommit,
    onAnnounce,
  }))
  return null
}

const press = (code: string) => ({ code, preventDefault: vi.fn() })

describe('useKeyboardReorder immediate event delivery', () => {
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

  it('processes Space, Arrow, and Space before React renders between events', () => {
    const onCommit = vi.fn()
    const onAnnounce = vi.fn()
    let state: ReorderState | null = null

    const current = (): ReorderState => {
      if (!state) throw new Error('Keyboard reorder harness did not initialize')
      return state
    }

    act(() => {
      root.render(
        <Harness
          onReady={(value) => { state = value }}
          onCommit={onCommit}
          onAnnounce={onAnnounce}
        />,
      )
    })

    // Browser key events can arrive in one task before React renders state
    // from the preceding event. Keep using the same pre-render handler to
    // reproduce that scheduling boundary exactly.
    const initialHandler = current().handleKeyDown
    act(() => {
      initialHandler(press('Space'), 'task-b')
      initialHandler(press('ArrowUp'), 'task-b')
      initialHandler(press('Space'), 'task-b')
    })

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(['task-b', 'task-a'])
    expect(onAnnounce.mock.calls.map(([message]) => message)).toEqual([
      'Picked up task B. Use the arrow keys to move, space bar to drop.',
      'task B moved to position 1 of 2.',
      'Dropped task B. Final position 1 of 2.',
    ])
  })
})
