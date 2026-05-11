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
      icon={{ name: 'cloud' }}
      title="Save this roadmap to RoadForge"
      sub="Save to enable collaboration, share links, realtime sync, and activity logs. Your local copy stays on this browser as a fallback."
      footer={
        <>
          <button className="back" onClick={onClose}>
            Keep local
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={handleConfirm}>
            Save to RoadForge{' '}
            <Icon name="arrow-right" size={15} stroke="#fff" />
          </button>
        </>
      }
    >
      <div className="save-illus">
        <div className="node">
          <div className="glyph">
            <Icon name="device" size={20} stroke="#fff" />
          </div>
          <span className="lbl">This device</span>
        </div>
        <div className="arrow">
          <span className="line" />
        </div>
        <div className="node">
          <div className="glyph">
            <Icon name="cloud" size={20} stroke="#fff" />
          </div>
          <span className="lbl">RoadForge</span>
        </div>
      </div>

      <div className="bullet">
        <span className="dot">
          <Icon name="users" size={13} />
        </span>
        <span className="text">
          <b>Collaboration:</b> Invite editors and viewers with secure
          links. No accounts required.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="spark" size={13} />
        </span>
        <span className="text">
          <b>Realtime sync:</b> Connected collaborators receive updates
          while working on the roadmap.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="activity" size={13} />
        </span>
        <span className="text">
          <b>Activity logs:</b> Track joins, saves, link changes, and
          roadmap activity in one place.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="link" size={13} />
        </span>
        <span className="text">
          <b>Access elsewhere:</b> RoadForge is accountless. Keep an invite
          link or export so you can reopen shared roadmaps elsewhere.
        </span>
      </div>

      <div style={{ marginTop: 20 }}>
        <label
          htmlFor="rm-pw"
          style={{ fontSize: 13, color: 'var(--ink-3)', display: 'block', marginBottom: 6 }}
        >
          Password (optional)
        </label>
        <div className="password-field">
          <input
            id="rm-pw"
            className="password-input"
            type={showPassword ? 'text' : 'password'}
            placeholder="Protect with a password — min 6 characters"
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (pwError) setPwError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm() }}
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
          <span style={{ fontSize: 12, color: 'var(--ember)', marginTop: 4, display: 'block' }}>
            {pwError}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 4, display: 'block' }}>
            People joining with an invite link will also need this password.
          </span>
        )}
      </div>

      <div className="note-line" style={{ marginTop: 16 }}>
        <span className="ic">
          <Icon name="shield" size={14} />
        </span>
        <span>
          After saving, open Share and copy a link for any device or collaborator
          that needs access. RoadForge is accountless, so access is link-based.
        </span>
      </div>
    </Modal>
  )
}
