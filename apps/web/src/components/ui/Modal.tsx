'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
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

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function trapTabFocus(e: KeyboardEvent, dialog: HTMLDivElement | null) {
  if (!dialog) return
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => {
    const isJsDom = typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom')
    const isVisible = el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0 || isJsDom
    return isVisible || el === document.activeElement
  })
  if (focusable.length === 0) {
    e.preventDefault()
    dialog.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  const insideDialog = active instanceof Node && dialog.contains(active)
  if (!insideDialog) {
    e.preventDefault()
    ;(e.shiftKey ? last : first).focus()
    return
  }
  if (e.shiftKey) {
    if (active === first || active === dialog) {
      e.preventDefault()
      last.focus()
    }
  } else if (active === last) {
    e.preventDefault()
    first.focus()
  }
}

export function Modal({ open, onClose, icon, title, sub, describedBy, children, footer, width, role = 'dialog' }: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const ariaDescription = [
    sub ? descriptionId : null,
    describedBy,
  ].filter(Boolean).join(' ') || undefined

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusFrame = window.requestAnimationFrame(() => {
      if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
        dialogRef.current.focus()
      }
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return
        onClose()
        return
      }
      if (e.key === 'Tab') trapTabFocus(e, dialogRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKey)
      if (previouslyFocused?.isConnected) {
        const currentActive = document.activeElement
        const focusInside = currentActive && dialogRef.current?.contains(currentActive)
        const focusOnBody = currentActive === document.body
        if (focusInside || focusOnBody || !currentActive) {
          previouslyFocused.focus()
        }
      }
    }
  }, [open, onClose])

  if (!open) return null

  return (
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
    </div>
  )
}
