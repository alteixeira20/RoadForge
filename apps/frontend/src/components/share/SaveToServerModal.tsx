'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'

interface SaveToServerModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (password?: string) => void
}

export function SaveToServerModal({ open, onClose, onConfirm }: SaveToServerModalProps) {
  const [password, setPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!open) {
      setPassword('')
      setPwError('')
      setShowPassword(false)
    }
  }, [open])

  const handleConfirm = () => {
    if (password && password.length < 6) {
      setPwError('Password must be at least 6 characters.')
      return
    }
    onConfirm(password || undefined)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={{ name: 'share' }}
      title="Enable sharing"
      sub="Create a server copy so other people and devices can open this roadmap. Your local copy remains in this browser."
      footer={
        <>
          <button className="back" onClick={onClose}>
            Not now
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={handleConfirm}>
            Enable sharing{' '}
            <Icon name="arrow-right" size={15} stroke="#fff" />
          </button>
        </>
      }
    >
      <div className="save-illus" aria-hidden="true">
        <div className="node">
          <div className="glyph">
            <Icon name="device" size={20} stroke="#fff" />
          </div>
          <span className="lbl">This browser</span>
        </div>
        <div className="arrow">
          <span className="line" />
        </div>
        <div className="node">
          <div className="glyph">
            <Icon name="cloud" size={20} stroke="#fff" />
          </div>
          <span className="lbl">Shared copy</span>
        </div>
      </div>

      <div className="bullet">
        <span className="dot">
          <Icon name="link" size={13} />
        </span>
        <span className="text">
          <b>Role-based links:</b> Invite owners, editors, or read-only viewers without accounts.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="activity" size={13} />
        </span>
        <span className="text">
          <b>Live collaboration:</b> Sync changes, show activity, and preserve restore points.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="device" size={13} />
        </span>
        <span className="text">
          <b>Local fallback:</b> Failed or conflicting saves do not remove the browser copy.
        </span>
      </div>

      <div className="password-section">
        <label htmlFor="rm-pw" className="password-label">
          Join password (optional)
        </label>
        <div className="password-field">
          <input
            id="rm-pw"
            className="password-input"
            type={showPassword ? 'text' : 'password'}
            placeholder="At least 6 characters"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (pwError) setPwError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleConfirm()
            }}
            maxLength={128}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
          </button>
        </div>
        {pwError ? (
          <span className="password-hint error">{pwError}</span>
        ) : (
          <span className="password-hint">
            Everyone joining through a link must also enter this password.
          </span>
        )}
      </div>

      <div className="note-line">
        <span className="ic">
          <Icon name="shield" size={14} />
        </span>
        <span>
          Owner and editor links grant access. Send them only to people you trust.
        </span>
      </div>
    </Modal>
  )
}
