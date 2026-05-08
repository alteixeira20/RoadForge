'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { MOCK_SHARE_LINKS } from '@/data/sample-roadmap'
import type { IconName } from '@/components/ui/Icon'

export function ShareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (id: string, url: string) => {
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 1600)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={580}
      icon={{ name: 'share', plain: true }}
      title="Share this roadmap"
      sub="Anyone with a link can join with the role you choose. Links are signed and revocable."
      footer={
        <>
          <span className="note">
            <Icon name="lock" size={12} /> Share links carefully — anyone with a link can join.
          </span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="share-list">
        {MOCK_SHARE_LINKS.map((link) => (
          <div key={link.id} className={`share-row ${link.recommended ? 'recommended' : ''}`}>
            <div className="ic">
              <Icon name={link.icon as IconName} size={16} />
            </div>
            <div className="meta">
              <div className="h">
                {link.role === 'owner'
                  ? 'Owner'
                  : link.role === 'editor'
                  ? 'Editor invite'
                  : 'Viewer (read-only)'}
                {link.recommended && (
                  <span className="badge ember">Recommended</span>
                )}
              </div>
              <div className="d">{link.desc}</div>
            </div>
            <div className="link-line">
              <code>{link.url}</code>
              <button
                className={`copy ${copied === link.id ? 'copied' : ''}`}
                onClick={() => copy(link.id, link.url)}
              >
                {copied === link.id ? (
                  <>
                    <Icon name="check" size={13} /> Copied
                  </>
                ) : (
                  <>
                    <Icon name="link" size={13} /> Copy
                  </>
                )}
              </button>
            </div>
            <div className="actions">
              <button className="mini">
                <Icon name="link" size={12} /> Regenerate
              </button>
              <button className="mini">
                <Icon name="x" size={12} /> Revoke
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
