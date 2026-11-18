'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { canRestoreFocus, trapDialogTabFocus } from '@/lib/dialog-focus'

type OverlayRole = 'menu' | 'dialog'
type HorizontalAlignment = 'start' | 'end'

interface AnchoredOverlayPositionInput {
  anchor: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>
  overlayWidth: number
  overlayHeight: number
  viewportWidth: number
  viewportHeight: number
  alignment?: HorizontalAlignment
  offset?: number
  padding?: number
}

export interface AnchoredOverlayPosition {
  top: number
  left: number
  maxHeight: number
  side: 'top' | 'bottom'
}

export function calculateAnchoredOverlayPosition({
  anchor,
  overlayWidth,
  overlayHeight,
  viewportWidth,
  viewportHeight,
  alignment = 'end',
  offset = 6,
  padding = 8,
}: AnchoredOverlayPositionInput): AnchoredOverlayPosition {
  const spaceBelow = Math.max(0, viewportHeight - anchor.bottom - offset - padding)
  const spaceAbove = Math.max(0, anchor.top - offset - padding)
  const side = overlayHeight > spaceBelow && spaceAbove > spaceBelow ? 'top' : 'bottom'
  const maxHeight = side === 'bottom' ? spaceBelow : spaceAbove
  const renderedHeight = Math.min(overlayHeight, maxHeight)
  const unclampedTop = side === 'bottom'
    ? anchor.bottom + offset
    : anchor.top - offset - renderedHeight
  const maxTop = Math.max(padding, viewportHeight - padding - renderedHeight)
  const top = Math.min(Math.max(unclampedTop, padding), maxTop)
  const unclampedLeft = alignment === 'end'
    ? anchor.right - overlayWidth
    : anchor.left
  const maxLeft = Math.max(padding, viewportWidth - padding - overlayWidth)
  const left = Math.min(Math.max(unclampedLeft, padding), maxLeft)

  return { top, left, maxHeight, side }
}

interface AnchoredOverlayProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  id?: string
  role: OverlayRole
  ariaLabel: string
  className: string
  children: ReactNode
  onClose: () => void
  alignment?: HorizontalAlignment
  returnFocus?: boolean
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    '[role="menuitem"]:not([disabled]), button:not([disabled]), input:not([disabled]), '
      + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ))
}

export function AnchoredOverlay({
  open,
  anchorRef,
  id,
  role,
  ariaLabel,
  className,
  children,
  onClose,
  alignment = 'end',
  returnFocus = true,
}: AnchoredOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const shouldReturnFocusRef = useRef(true)
  const [position, setPosition] = useState<AnchoredOverlayPosition | null>(null)

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    const overlay = overlayRef.current
    if (!anchor || !overlay) return
    const anchorRect = anchor.getBoundingClientRect()
    const overlayRect = overlay.getBoundingClientRect()
    setPosition(calculateAnchoredOverlayPosition({
      anchor: anchorRect,
      overlayWidth: overlayRect.width,
      overlayHeight: overlayRect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      alignment,
    }))
  }, [alignment, anchorRef])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, updatePosition, children])

  useEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    shouldReturnFocusRef.current = true
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    let frame = 0
    const schedulePosition = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updatePosition)
    }
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(schedulePosition)
    if (anchor) resizeObserver?.observe(anchor)
    if (overlayRef.current) resizeObserver?.observe(overlayRef.current)

    window.addEventListener('resize', schedulePosition)
    document.addEventListener('scroll', schedulePosition, true)
    const focusFrame = window.requestAnimationFrame(() => {
      const overlay = overlayRef.current
      if (!overlay) return
      focusableElements(overlay)[0]?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(focusFrame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', schedulePosition)
      document.removeEventListener('scroll', schedulePosition, true)
      if (
        returnFocus
        && shouldReturnFocusRef.current
        && anchor
        && canRestoreFocus(anchor)
      ) {
        anchor.focus({ preventScroll: true })
      } else if (
        returnFocus
        && shouldReturnFocusRef.current
        && canRestoreFocus(previouslyFocusedRef.current)
      ) {
        previouslyFocusedRef.current.focus({ preventScroll: true })
      }
    }
  }, [anchorRef, open, returnFocus, updatePosition])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (overlayRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      shouldReturnFocusRef.current = false
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [anchorRef, onClose, open])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const overlay = overlayRef.current
    if (!overlay) return
    if (role === 'dialog' && event.key === 'Tab') {
      trapDialogTabFocus(event.nativeEvent, overlay)
      return
    }
    if (role !== 'menu') return
    const items = focusableElements(overlay)
    const currentIndex = items.indexOf(document.activeElement as HTMLElement)
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
    if (event.key === 'ArrowUp') {
      nextIndex = currentIndex < 0
        ? items.length - 1
        : (currentIndex - 1 + items.length) % items.length
    }
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = items.length - 1
    if (event.key === 'Tab') {
      event.preventDefault()
      const pageItems = Array.from(document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
          + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !overlay.contains(element) && canRestoreFocus(element))
      const anchorIndex = pageItems.indexOf(anchorRef.current as HTMLElement)
      const targetIndex = event.shiftKey ? anchorIndex - 1 : anchorIndex + 1
      const target = pageItems[targetIndex]
      shouldReturnFocusRef.current = false
      onClose()
      queueMicrotask(() => target?.focus({ preventScroll: true }))
      return
    }
    if (nextIndex === null || items.length === 0) return
    event.preventDefault()
    items[nextIndex]?.focus()
  }

  if (!open || typeof document === 'undefined') return null

  const style: CSSProperties = position
    ? {
      top: position.top,
      left: position.left,
      maxHeight: position.maxHeight,
      visibility: 'visible',
    }
    : { top: 0, left: 0, visibility: 'hidden' }

  return createPortal(
    <div
      id={id}
      ref={overlayRef}
      className={`anchored-overlay ${className}`}
      role={role}
      aria-label={ariaLabel}
      data-side={position?.side}
      style={style}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>,
    document.body,
  )
}
