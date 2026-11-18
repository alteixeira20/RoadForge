// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KeyboardReorderCoordinatorProvider,
  useCoordinatedKeyboardReorder,
  useKeyboardReorderCoordinator,
} from '@/hooks/useKeyboardReorderCoordinator'

type ListState = ReturnType<typeof useCoordinatedKeyboardReorder>

interface Rig {
  a: ListState
  b: ListState
  announcement: string
  activeListId: string | null
  cancelActive: () => void
}

function Rig({
  onCommitA,
  onCommitB,
  onReady,
}: {
  onCommitA: (ids: string[]) => void
  onCommitB: (ids: string[]) => void
  onReady: (rig: Rig) => void
}) {
  const a = useCoordinatedKeyboardReorder('list-a', ['a1', 'a2'], {
    itemLabel: (id) => id,
    onCommit: onCommitA,
  })
  const b = useCoordinatedKeyboardReorder('list-b', ['b1', 'b2'], {
    itemLabel: (id) => id,
    onCommit: onCommitB,
  })
  const coordinator = useKeyboardReorderCoordinator()
  onReady({
    a,
    b,
    announcement: coordinator.announcement,
    activeListId: coordinator.activeListId,
    cancelActive: coordinator.cancelActive,
  })
  return null
}

const press = (code: string) => ({ code, preventDefault: vi.fn() })

describe('useKeyboardReorderCoordinator (RF-034 single workspace-wide session)', () => {
  let container: HTMLDivElement
  let root: Root
  let rig: Rig | null
  let onCommitA: ReturnType<typeof vi.fn>
  let onCommitB: ReturnType<typeof vi.fn>

  const render = () => {
    act(() => {
      root.render(
        <KeyboardReorderCoordinatorProvider>
          <Rig onCommitA={onCommitA} onCommitB={onCommitB} onReady={(value) => { rig = value }} />
        </KeyboardReorderCoordinatorProvider>,
      )
    })
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    rig = null
    onCommitA = vi.fn()
    onCommitB = vi.fn()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function current(): Rig {
    if (!rig) throw new Error('Coordinator rig did not initialize')
    return rig
  }

  it('starting a session in one list cancels an active session in another', () => {
    render()
    act(() => current().a.handleKeyDown(press('Space'), 'a1'))
    expect(current().a.activeId).toBe('a1')
    expect(current().activeListId).toBe('list-a')

    act(() => current().b.handleKeyDown(press('Space'), 'b1'))
    expect(current().b.activeId).toBe('b1')
    expect(current().a.activeId).toBeNull()
    expect(current().activeListId).toBe('list-b')
    expect(onCommitA).not.toHaveBeenCalled()
  })

  it('the takeover announcement reflects the new session, not the cancelled one', () => {
    render()
    act(() => current().a.handleKeyDown(press('Space'), 'a1'))
    act(() => current().b.handleKeyDown(press('Space'), 'b1'))

    // Deterministic ordering (see useKeyboardReorder's onSessionStart):
    // the old session's "cancelled" announcement is superseded by the new
    // session's own "picked up" one in the same synchronous call, not
    // raced across two components' independent effects.
    expect(current().announcement).toContain('Picked up')
    expect(current().announcement).not.toContain('cancelled')
  })

  it('starting a second session in the same list it is already active in does not self-cancel', () => {
    render()
    act(() => current().a.handleKeyDown(press('Space'), 'a1'))
    act(() => current().a.handleKeyDown(press('ArrowDown'), 'a1'))
    expect(current().a.activeId).toBe('a1')
    expect(current().activeListId).toBe('list-a')
  })

  it('cancelActive() cancels whichever list is currently active', () => {
    render()
    act(() => current().a.handleKeyDown(press('Space'), 'a1'))
    expect(current().activeListId).toBe('list-a')

    act(() => current().cancelActive())
    expect(current().a.activeId).toBeNull()
    expect(current().activeListId).toBeNull()
    expect(onCommitA).not.toHaveBeenCalled()
  })

  it('cancelActive() is a no-op when nothing is active', () => {
    render()
    act(() => current().cancelActive())
    expect(current().activeListId).toBeNull()
  })

  it('dropping clears activeListId, leaving the coordinator free for the next session', () => {
    render()
    act(() => current().a.handleKeyDown(press('Space'), 'a1'))
    act(() => current().a.handleKeyDown(press('ArrowDown'), 'a1'))
    act(() => current().a.handleKeyDown(press('Space'), 'a1'))

    expect(current().activeListId).toBeNull()
    expect(onCommitA).toHaveBeenCalledTimes(1)

    act(() => current().b.handleKeyDown(press('Space'), 'b1'))
    expect(current().activeListId).toBe('list-b')
  })
})
