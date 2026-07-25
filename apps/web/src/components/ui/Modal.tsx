'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { canRestoreFocus, trapDialogTabFocus } from '@/lib/dialog-focus'
import { Icon } from './Icon'
import type { IconName } from './Icon'

interface ModalIcon {
  name: IconName
  plain?: boolean
}

interface ModalProps {
  open: boolean
  onClose: () => void
  icon?: ModalIcon
  title: string
  sub?: string
  describedBy?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
  role?: 'dialog' | 'alertdialog'
}

export function Modal({ open, onClose, icon, title, sub, describedBy, children, footer, width, role = 'dialog' }: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  if (open && !wasOpenRef.current && typeof document !== 'undefined') {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  }
  wasOpenRef.current = open
  const ariaDescription = [
    sub ? descriptionId : null,
    describedBy,
  ].filter(Boolean).join(' ') || undefined

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return

    const focusFrame = window.requestAnimationFrame(() => {
      if (!dialog.contains(document.activeElement)) {
        dialog.focus()
      }
    })
    const onKey = (event: KeyboardEvent) => {
      const openDialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]')
      const isTopmost = openDialogs.item(openDialogs.length - 1) === dialog
      if (!isTopmost) return
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'Tab') trapDialogTabFocus(event, dialog)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKey)

      const previouslyFocused = previouslyFocusedRef.current
      if (canRestoreFocus(previouslyFocused)) {
        const currentActive = document.activeElement
        const focusInside = currentActive instanceof Node && dialog.contains(currentActive)
        const focusOnBody = currentActive === document.body
        if (focusInside || focusOnBody || !currentActive) {
          previouslyFocused.focus({ preventScroll: true })
        }
      }
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="modal-scrim">
      <div
        ref={dialogRef}
        className="modal"
        style={width ? { width } : undefined}
        role={role}
        aria-modal
        aria-labelledby={titleId}
        aria-describedby={ariaDescription}
        tabIndex={-1}
      >
        <div className="modal-head">
          {icon && (
            <div className={`ic ${icon.plain ? 'plain' : ''}`}>
              <Icon name={icon.name} size={20} stroke={icon.plain ? 'var(--ember)' : '#fff'} />
            </div>
          )}
          <div className="text">
            <h2 id={titleId}>{title}</h2>
            {sub && <p id={descriptionId} className="sub">{sub}</p>}
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
