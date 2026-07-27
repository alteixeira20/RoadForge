'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Application-owned keyboard reordering (RF-048). dnd-kit's own
 * KeyboardSensor is not used for the actual pickup/move/drop logic here —
 * only for pointer/touch, which is unaffected by any of this.
 *
 * Two confirmed dnd-kit KeyboardSensor timing defects made it unsuitable
 * for keyboard:
 *
 * 1. The `over` id it reports at drop time comes from internal, rect-based
 *    collision detection that depends on an async (ResizeObserver-driven)
 *    remeasurement, which can still be in flight when Space (drop) is
 *    processed right after Arrow — so `over` intermittently still reports
 *    the dragged item's own pre-move position instead of its neighbor.
 *    Reproducible regardless of collision algorithm, measuring strategy,
 *    or forcing a synchronous React flush.
 *
 * 2. `KeyboardSensor.attach()` (in @dnd-kit/core's source) registers its
 *    own keydown listener via `setTimeout(() => this.listeners.add(...))`
 *    — a deferred macrotask, not synchronous with the Space keydown that
 *    constructs the sensor. If a following keydown (Arrow, or the second
 *    Space that drops) is dispatched before that timer fires, dnd-kit's
 *    sensor never sees it at all. Confirmed via direct instrumentation to
 *    affect not just Arrow but the drop-ending Space itself under enough
 *    system load (e.g. running other CPU-heavy work concurrently) —
 *    leaving `aria-pressed` stuck "true" forever, since dnd-kit's own
 *    `handleEnd()` never ran.
 *
 * Routing the whole pickup/move/drop cycle through a plain React
 * `onKeyDown` on the drag handle sidesteps both: React's synthetic event
 * delegation is attached once at mount (not deferred), so it reliably
 * fires for every keydown regardless of dnd-kit's internal listener
 * timing, and the committed order comes from the stable pre-drag id order
 * plus plain arithmetic — nothing rect- or observer-based, so it can never
 * be stale either.
 *
 * `getOrderedIds` must return the *current* sorted id list on every call (a
 * ref-backed getter, not a value captured once).
 */
export interface UseKeyboardReorderOptions {
  disabled?: boolean
  /** Human-readable label for `id`, used in live announcements. */
  itemLabel: (id: string) => string
  /** Commits an immediate reorder from `fromIndex` to `toIndex`. */
  onReorder: (fromIndex: number, toIndex: number) => void
}

export interface MinimalKeyboardEvent {
  code: string
  preventDefault: () => void
}

export function useKeyboardReorder(
  getOrderedIds: () => string[],
  { disabled = false, itemLabel, onReorder }: UseKeyboardReorderOptions,
) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const startIndexRef = useRef<number | null>(null)
  const currentIndexRef = useRef<number | null>(null)

  const endDrag = useCallback((message: string) => {
    setActiveId(null)
    startIndexRef.current = null
    currentIndexRef.current = null
    setAnnouncement(message)
  }, [])

  const handleKeyDown = useCallback((event: MinimalKeyboardEvent, itemId: string) => {
    const orderedIds = getOrderedIds()

    if (activeId === null) {
      // `disabled` only gates *starting* a new drag. Once a drag is
      // already active, dropping or cancelling it via keyboard must still
      // be possible even if `disabled` becomes true in the meantime (e.g.
      // a sibling task expands mid-drag) — otherwise the drag is stranded
      // active with no way out, reproducing the same class of "stuck"
      // bug this hook exists to eliminate.
      if (disabled) return
      if (event.code !== 'Space' && event.code !== 'Enter') return
      event.preventDefault()
      const index = orderedIds.indexOf(itemId)
      startIndexRef.current = index
      currentIndexRef.current = index
      setActiveId(itemId)
      setAnnouncement(`Picked up ${itemLabel(itemId)}. Use the arrow keys to move, space bar to drop.`)
      return
    }

    if (activeId !== itemId) return

    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      const index = currentIndexRef.current ?? orderedIds.indexOf(itemId)
      endDrag(`Dropped ${itemLabel(itemId)}. Final position ${index + 1} of ${orderedIds.length}.`)
      return
    }

    if (event.code === 'Escape') {
      event.preventDefault()
      const start = startIndexRef.current
      const current = currentIndexRef.current
      if (start !== null && current !== null && current !== start) {
        onReorder(current, start)
      }
      endDrag(`Reorder cancelled. ${itemLabel(itemId)} returned to its original position.`)
      return
    }

    const isNext = event.code === 'ArrowDown' || event.code === 'ArrowRight'
    const isPrev = event.code === 'ArrowUp' || event.code === 'ArrowLeft'
    if (!isNext && !isPrev) return

    event.preventDefault()
    const current = currentIndexRef.current ?? orderedIds.indexOf(itemId)
    const next = isNext
      ? Math.min(current + 1, orderedIds.length - 1)
      : Math.max(current - 1, 0)
    if (next === current) return
    onReorder(current, next)
    currentIndexRef.current = next
    setAnnouncement(`${itemLabel(itemId)} moved to position ${next + 1} of ${orderedIds.length}.`)
  }, [activeId, disabled, endDrag, getOrderedIds, itemLabel, onReorder])

  return { activeId, announcement, handleKeyDown }
}
