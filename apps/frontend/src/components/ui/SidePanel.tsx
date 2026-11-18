'use client'

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react'
import { canRestoreFocus } from '@/lib/dialog-focus'
import { Icon } from './Icon'

interface SidePanelProps {
  title: string
  className?: string
  headerActions?: ReactNode
  children: ReactNode
  onClose: () => void
}

export function SidePanel({
  title,
  className,
  headerActions,
  children,
  onClose,
}: SidePanelProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusFrame = window.requestAnimationFrame(() => {
      closeRef.current?.focus({ preventScroll: true })
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleKeyDown)
      if (canRestoreFocus(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [onClose])

  return (
    <aside
      ref={panelRef}
      className={`slide-panel${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-labelledby={titleId}
    >
      <div className="panel-head">
        <h3 id={titleId}>{title}</h3>
        {headerActions}
        <button
          ref={closeRef}
          type="button"
          className="close-btn"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <Icon name="x" size={18} />
        </button>
      </div>
      {children}
    </aside>
  )
}
