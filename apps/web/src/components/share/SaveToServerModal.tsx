'use client'

import { useState, useEffect } from 'react'
import { TEAM_FEATURES_ENABLED } from '@/config/capabilities'
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
    if (TEAM_FEATURES_ENABLED && password && password.length < 6) {
      setPwError('Password must be at least 6 characters.')
      return
    }
    onConfirm(TEAM_FEATURES_ENABLED ? password || undefined : undefined)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={{ name: 'cloud' }}
      title="Save to RoadForge service"
      sub="Create a durable service-backed copy for local API and coding-agent access. Your portable browser copy remains available."
      footer={
        <>
          <button className="back" onClick={onClose}>
            Not now
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={handleConfirm}>
            Save to service{' '}
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
          <span className="lbl">RoadForge service</span>
        </div>
      </div>

      <div className="bullet">
        <span className="dot">
          <Icon name="device" size={13} />
        </span>
        <span className="text">
          <b>Durable local service:</b> Keep a Postgres-backed roadmap available to RoadForge outside this browser session.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="activity" size={13} />
        </span>
        <span className="text">
          <b>API and agent access:</b> Use the local RoadForge API and MCP integration without enabling team collaboration.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="share" size={13} />
        </span>
        <span className="text">
          <b>Team sharing:</b> In progress — available soon. Service backing does not make this roadmap shared today.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="export" size={13} />
        </span>
        <span className="text">
          <b>Portable JSON:</b> Import and export remain available independently of the local service.
        </span>
      </div>

      {TEAM_FEATURES_ENABLED && (
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
      )}

      <div className="note-line">
        <span className="ic">
          <Icon name="shield" size={14} />
        </span>
        <span>
          In solo mode the service is intended for this machine and binds its user-facing ports to loopback.
        </span>
      </div>
    </Modal>
  )
}
