'use client'

import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'

interface SaveToServerModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export function SaveToServerModal({ open, onClose, onConfirm }: SaveToServerModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={{ name: 'cloud' }}
      title="Save this roadmap to your server"
      sub="Saving to a Roadforge server unlocks collaboration. Your local copy stays on this device as a fallback."
      footer={
        <>
          <button className="back" onClick={onClose}>
            Stay local
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={onConfirm}>
            Save and enable collaboration{' '}
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
          <span className="lbl">Your server</span>
        </div>
      </div>

      <div className="bullet">
        <span className="dot">
          <Icon name="users" size={13} />
        </span>
        <span className="text">
          <b>Collaboration unlocks.</b> Invite editors and viewers through secure
          links — no accounts required for them either.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="activity" size={13} />
        </span>
        <span className="text">
          <b>Activity log becomes available.</b> See who changed what, scoped to
          this roadmap.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="export" size={13} />
        </span>
        <span className="text">
          <b>You can still export.</b> JSON, Markdown, and PDF stay one click
          away.
        </span>
      </div>
      <div className="bullet">
        <span className="dot">
          <Icon name="lock" size={13} />
        </span>
        <span className="text">
          <b>Optional, always.</b> You can switch back to local-only at any time.
        </span>
      </div>

      <div className="note-line">
        <span className="ic">
          <Icon name="shield" size={14} />
        </span>
        <span>
          You&apos;re saving to{' '}
          <span className="mono" style={{ color: 'var(--ink)' }}>
            roadforge.local:7878
          </span>{' '}
          — your self-hosted server. Configure a different endpoint in settings.
        </span>
      </div>
    </Modal>
  )
}
