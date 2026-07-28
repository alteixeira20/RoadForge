'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useKeyboardReorder, type UseKeyboardReorderOptions } from './useKeyboardReorder'

/**
 * Enforces "only one workspace-wide keyboard reorder session at a time"
 * (RF-034) on top of useKeyboardReorder's per-list preview/commit state.
 *
 * Each list registers its own `cancel` when it starts a session
 * (`beginSession`); starting a session anywhere else first calls that
 * registered `cancel`, so exactly one list is ever mid-drag. `announce`
 * feeds the single global live region (see `GlobalKeyboardReorderAnnouncer`)
 * instead of each list mounting its own - a stale list's announcement can
 * never linger after a different one takes over.
 */
interface ActiveSession {
  listId: string
  cancel: () => void
}

interface KeyboardReorderCoordinatorApi {
  announcement: string
  activeListId: string | null
  announce: (message: string) => void
  beginSession: (listId: string, cancel: () => void) => void
  endSession: (listId: string) => void
  /** Cancels whatever session is currently active, if any - for triggers
   *  not owned by any particular list, e.g. a pointer drag starting. */
  cancelActive: () => void
}

const KeyboardReorderCoordinatorContext = createContext<KeyboardReorderCoordinatorApi | null>(null)

export function KeyboardReorderCoordinatorProvider({ children }: { children: ReactNode }) {
  const [announcement, setAnnouncement] = useState('')
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const activeRef = useRef<ActiveSession | null>(null)

  const announce = useCallback((message: string) => {
    setAnnouncement(message)
  }, [])

  const beginSession = useCallback((listId: string, cancel: () => void) => {
    if (activeRef.current && activeRef.current.listId !== listId) {
      activeRef.current.cancel()
    }
    activeRef.current = { listId, cancel }
    setActiveListId(listId)
  }, [])

  const endSession = useCallback((listId: string) => {
    if (activeRef.current?.listId !== listId) return
    activeRef.current = null
    setActiveListId(null)
  }, [])

  const cancelActive = useCallback(() => {
    activeRef.current?.cancel()
  }, [])

  const value = useMemo<KeyboardReorderCoordinatorApi>(() => ({
    announcement,
    activeListId,
    announce,
    beginSession,
    endSession,
    cancelActive,
  }), [announcement, activeListId, announce, beginSession, endSession, cancelActive])

  return (
    <KeyboardReorderCoordinatorContext.Provider value={value}>
      {children}
    </KeyboardReorderCoordinatorContext.Provider>
  )
}

export function useKeyboardReorderCoordinator(): KeyboardReorderCoordinatorApi {
  const ctx = useContext(KeyboardReorderCoordinatorContext)
  if (!ctx) {
    throw new Error(
      'useKeyboardReorderCoordinator must be used within a KeyboardReorderCoordinatorProvider',
    )
  }
  return ctx
}

export type CoordinatedKeyboardReorderOptions = Omit<
  UseKeyboardReorderOptions,
  'onAnnounce' | 'onSessionStart' | 'onSessionEnd'
>

/**
 * Drop-in replacement for `useKeyboardReorder` that wires it into the
 * workspace-wide coordinator: `listId` must be stable and unique per list
 * (the existing per-list DndContext `id` values are a natural fit).
 */
export function useCoordinatedKeyboardReorder(
  listId: string,
  orderedIds: string[],
  options: CoordinatedKeyboardReorderOptions,
) {
  const coordinator = useKeyboardReorderCoordinator()
  // `beginSession` needs a stable function it can hold onto and call later
  // (when a *different* list takes over) - but the freshest `cancel` isn't
  // known until useKeyboardReorder below returns. The ref bridges that:
  // the wrapper's identity never changes, but it always calls whatever
  // `cancel` implementation was most recently assigned to it.
  const cancelRef = useRef<() => void>(() => {})

  const keyboardReorder = useKeyboardReorder(orderedIds, {
    ...options,
    onAnnounce: coordinator.announce,
    onSessionStart: () => coordinator.beginSession(listId, () => cancelRef.current()),
    onSessionEnd: () => coordinator.endSession(listId),
  })

  cancelRef.current = keyboardReorder.cancel

  return keyboardReorder
}
