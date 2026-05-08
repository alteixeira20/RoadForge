'use client'

import { useEffect, type ReactNode } from 'react'
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
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export function Modal({ open, onClose, icon, title, sub, children, footer, width }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" style={width ? { width } : undefined} role="dialog" aria-modal>
        <div className="modal-head">
          {icon && (
            <div className={`ic ${icon.plain ? 'plain' : ''}`}>
              <Icon name={icon.name} size={20} stroke={icon.plain ? 'var(--ember)' : '#fff'} />
            </div>
          )}
          <div className="text">
            <h2>{title}</h2>
            {sub && <p className="sub">{sub}</p>}
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
