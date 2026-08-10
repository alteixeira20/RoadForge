'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'

/**
 * Application-owned keyboard reordering (RF-034). dnd-kit's own
 * KeyboardSensor is not used for the actual pickup/move/drop logic here -
 * only for pointer/touch, which is unaffected by any of this.
 *
 * Two confirmed dnd-kit KeyboardSensor timing defects made it unsuitable
 * for keyboard:
 *
 * 1. The `over` id it reports at drop time comes from internal, rect-based
 *    collision detection that depends on an async (ResizeObserver-driven)
 *    remeasurement, which can still be in flight when Space (drop) is
 *    processed right after Arrow - so `over` intermittently still reports
 *    the dragged item's own pre-move position instead of its neighbor.
 *    Reproducible regardless of collision algorithm, measuring strategy,
 *    or forcing a synchronous React flush.
 *
 * 2. `KeyboardSensor.attach()` (in @dnd-kit/core's source) registers its
 *    own keydown listener via `setTimeout(() => this.listeners.add(...))`
 *    - a deferred macrotask, not synchronous with the Space keydown that
 *    constructs the sensor. If a following keydown (Arrow, or the second
 *    Space that drops) is dispatched before that timer fires, dnd-kit's
 *    sensor never sees it at all. Confirmed via direct instrumentation to
 *    affect not just Arrow but the drop-ending Space itself under enough
 *    system load (e.g. running other CPU-heavy work concurrently) -
 *    leaving `aria-pressed` stuck "true" forever, since dnd-kit's own
 *    `handleEnd()` never ran.
 *
 * Routing the whole pickup/move/drop cycle through a plain React
 * `onKeyDown` on the drag handle sidesteps both: React's synthetic event
 * delegation is attached once at mount (not deferred), so it reliably
 * fires for every keydown regardless of dnd-kit's internal listener
 * timing, and the committed order comes from the stable pre-drag id order
 * plus plain arithmetic - nothing rect- or observer-based, so it can never
 * be stale either.
 *
 * React state alone is not sufficient for that guarantee: several keydown
 * events may be delivered in one browser task before React renders the
 * state written by the preceding event. The refs below are therefore the
 * synchronous session state used by the event handler; React state mirrors
 * them for rendering. This makes a zero-delay Space -> Arrow -> Space
 * sequence deterministic even under a heavily loaded CI runner.
 *
 * Preview-then-commit: Arrow only ever mutates local `previewIds` state -
 * it never calls `onCommit`, sets `saved`, writes an activity entry, or
 * triggers autosync. `onCommit` fires exactly once, with the final ordered
 * id list, when the session ends by drop (Space/Enter). Escape, or the
 * session being cancelled externally (see `cancel`), discards the preview
 * with zero durable writes.
 */
export interface UseKeyboardReorderOptions {
  disabled?: boolean
  /** Human-readable label for `id`, used in live announcements. */
  itemLabel: (id: string) => string
  /** Commits the final ordered id list exactly once, on drop. */
  onCommit: (orderedIds: string[]) => void
  /**
   * Called synchronously, in the same call stack as the local
   * announcement state update, whenever the announcement changes. Lets an
   * external single-live-region coordinator (see
   * useKeyboardReorderCoordinator) mirror it without a `useEffect` race
   * against a *different* list's own announcement update landing in a
   * later, unordered render pass.
   */
  onAnnounce?: (message: string) => void
  /**
   * Called synchronously right before a new session starts (pickup),
   * before any local state changes - lets a workspace-wide coordinator
   * cancel whatever other list's session may currently be active first,
   * so its "cancelled" announcement always precedes this session's own
   * "picked up" one.
   */
  onSessionStart?: () => void
  /**
   * Called synchronously whenever a session ends, for any reason (drop,
   * Escape, or an external `cancel()`), after local state is cleared.
   */
  onSessionEnd?: () => void
}

export interface MinimalKeyboardEvent {
  code: string
  preventDefault: () => void
}

export function useKeyboardReorder(
  orderedIds: string[],
  {
    disabled = false,
    itemLabel,
    onCommit,
    onAnnounce,
    onSessionStart,
    onSessionEnd,
  }: UseKeyboardReorderOptions,
) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [previewIds, setPreviewIds] = useState<string[] | null>(null)
  const [announcement, setAnnouncement] = useState('')

  // `handleKeyDown` needs the *current* committed order at pickup time
  // without taking `orderedIds` in its own dependency array (it's handed
  // to every row, so recreating it every render the list's contents
  // change would defeat memoization) - a ref kept fresh every render
  // serves the same purpose the old getter-based API did.
  const orderedIdsRef = useRef(orderedIds)
  orderedIdsRef.current = orderedIds

  // These refs are the authoritative event-session state. Updating them in
  // the same call stack as setState prevents a following keydown from
  // observing a stale render when React batches multiple events.
  const activeIdRef = useRef<string | null>(activeId)
  activeIdRef.current = activeId
  const previewIdsRef = useRef<string[] | null>(previewIds)
  previewIdsRef.current = previewIds

  // The full committed order at pickup, kept separate from `previewIds`
  // (which changes on every Arrow move). Comparing the live `orderedIds`
  // against this snapshot - not just checking the active item still
  // exists - is what detects an item being added or removed elsewhere, a
  // committed reorder from another participant, or a filter change that
  // reshapes the visible set, so a stale preview never commits over state
  // it was never actually built from.
  const pickupOrderRef = useRef<string[] | null>(null)

  const announce = useCallback((message: string) => {
    setAnnouncement(message)
    onAnnounce?.(message)
  }, [onAnnounce])

  const endSession = useCallback((message: string) => {
    activeIdRef.current = null
    previewIdsRef.current = null
    pickupOrderRef.current = null
    setActiveId(null)
    setPreviewIds(null)
    announce(message)
    onSessionEnd?.()
  }, [announce, onSessionEnd])

  // Discards the active session, if any, with zero durable writes - safe
  // to call unconditionally (e.g. from a blur handler on every row, or an
  // external coordinator) since it no-ops when nothing is active.
  const cancel = useCallback(() => {
    const id = activeIdRef.current
    if (id === null) return
    endSession(`Reorder cancelled. ${itemLabel(id)} returned to its original position.`)
  }, [endSession, itemLabel])

  // A session still active when this list unmounts (e.g. a workspace view
  // change) never gets a chance to call endSession() itself - tell the
  // coordinator directly so it doesn't keep pointing at a cancel function
  // for a component that no longer exists.
  useEffect(() => {
    return () => {
      if (activeIdRef.current !== null) onSessionEnd?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Never let a stale preview outlive the data it was built from: if the
  // live committed order no longer matches the exact sequence captured at
  // pickup - an item was added or removed elsewhere, another participant
  // reordered it, the active item itself disappeared, or a filter change
  // reshaped the visible set - or the list becomes disabled (read-only)
  // mid-session, cancel rather than risk committing against ids that no
  // longer mean what the preview thinks they mean.
  useEffect(() => {
    if (activeId === null) return
    if (disabled) {
      cancel()
      return
    }
    const pickupOrder = pickupOrderRef.current
    if (pickupOrder === null) return
    const unchanged =
      pickupOrder.length === orderedIds.length &&
      pickupOrder.every((id, index) => orderedIds[index] === id)
    if (!unchanged) {
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedIds, disabled, activeId])

  const handleKeyDown = useCallback((event: MinimalKeyboardEvent, itemId: string) => {
    const currentActiveId = activeIdRef.current

    if (currentActiveId === null) {
      // `disabled` only gates *starting* a new session. Once one is
      // already active, dropping or cancelling it via keyboard must still
      // be possible even if `disabled` becomes true in the meantime -
      // otherwise the session is stranded active with no way out,
      // reproducing the same class of "stuck" bug this hook exists to
      // eliminate. (The effect above already proactively cancels in that
      // case, but this keeps the handler itself defensively correct.)
      if (disabled) return
      if (event.code !== 'Space' && event.code !== 'Enter') return
      event.preventDefault()
      // Cancel whatever other list's session may be active first (see
      // useKeyboardReorderCoordinator) so its "cancelled" announcement
      // always lands before this session's own "picked up" one below.
      onSessionStart?.()
      const snapshot = [...orderedIdsRef.current]
      pickupOrderRef.current = snapshot
      activeIdRef.current = itemId
      previewIdsRef.current = snapshot
      setActiveId(itemId)
      setPreviewIds(snapshot)
      announce(`Picked up ${itemLabel(itemId)}. Use the arrow keys to move, space bar to drop.`)
      return
    }

    if (currentActiveId !== itemId) return

    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      const finalIds = previewIdsRef.current ?? orderedIdsRef.current
      const index = finalIds.indexOf(itemId)
      const pickupOrder = pickupOrderRef.current ?? finalIds
      const changed =
        finalIds.length !== pickupOrder.length ||
        finalIds.some((id, position) => id !== pickupOrder[position])
      if (changed) {
        onCommit(finalIds)
      }
      endSession(`Dropped ${itemLabel(itemId)}. Final position ${index + 1} of ${finalIds.length}.`)
      return
    }

    if (event.code === 'Escape') {
      event.preventDefault()
      cancel()
      return
    }

    const isNext = event.code === 'ArrowDown' || event.code === 'ArrowRight'
    const isPrev = event.code === 'ArrowUp' || event.code === 'ArrowLeft'
    if (!isNext && !isPrev) return

    event.preventDefault()
    const ids = previewIdsRef.current ?? orderedIdsRef.current
    const current = ids.indexOf(itemId)
    const next = isNext ? Math.min(current + 1, ids.length - 1) : Math.max(current - 1, 0)
    if (next === current) {
      const boundary = isNext ? 'last' : 'first'
      announce(`${itemLabel(itemId)} is already at the ${boundary} position.`)
      return
    }
    const nextIds = arrayMove(ids, current, next)
    previewIdsRef.current = nextIds
    setPreviewIds(nextIds)
    announce(`${itemLabel(itemId)} moved to position ${next + 1} of ${ids.length}.`)
  }, [disabled, itemLabel, onCommit, onSessionStart, endSession, cancel, announce])

  return { activeId, previewIds, announcement, handleKeyDown, cancel }
}
