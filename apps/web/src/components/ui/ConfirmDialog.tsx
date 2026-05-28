'use client'

import { useId } from 'react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const confirmClass = tone === 'danger' ? 'btn sm danger' : 'btn sm primary'
  const messageId = useId()

  const footer = (
    <>
      <button className="btn sm ghost" onClick={onClose} disabled={loading}>
        {cancelLabel}
      </button>
      <span className="spacer" />
      <button className={confirmClass} onClick={onConfirm} disabled={loading}>
        {loading ? 'Please wait…' : confirmLabel}
      </button>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={footer}
      width={420}
      describedBy={messageId}
    >
      <p id={messageId} className="confirm-dialog-message">{message}</p>
    </Modal>
  )
}
