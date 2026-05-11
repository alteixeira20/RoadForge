'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { MOCK_SHARE_LINKS } from '@/data/sample-roadmap'
import { getShareLinks, regenerateShareLink, revokeShareLink } from '@/services/roadmap.service'
import { useRoadmap } from '@/context/RoadmapContext'
import type { ShareLink } from '@/types/roadmap'
import type { IconName } from '@/components/ui/Icon'

interface ShareModalProps {
  open: boolean
  onClose: () => void
  onToast: (msg: string) => void
}

export function ShareModal({ open, onClose, onToast }: ShareModalProps) {
  const { serverRoadmapId, sessionToken, isPasswordEnabled } = useRoadmap()
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (!serverRoadmapId) {
      setLinks(MOCK_SHARE_LINKS)
      return
    }
    let cancelled = false
    setLoading(true)
    getShareLinks(serverRoadmapId)
      .then((data) => { if (!cancelled) setLinks(data) })
      .catch(() => { if (!cancelled) onToast('Could not load share links') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // onToast identity is not stable (no useCallback in useToastState); omitting
    // it is safe because its behaviour never changes, only its reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, serverRoadmapId])

  const copy = (role: string, url: string) => {
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {})
    setCopied(role)
    setTimeout(() => setCopied(null), 1600)
  }

  const handleRegenerate = async (role: string) => {
    if (!serverRoadmapId) return
    if (!sessionToken) {
      onToast('Session expired — rejoin from the invite link')
      return
    }
    try {
      const updated = await regenerateShareLink(serverRoadmapId, role, sessionToken)
      setLinks((prev) => prev.map((l) => (l.role === role ? updated : l)))
      onToast('New link generated — copy it now')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('401')) onToast('Session expired — rejoin from the invite link')
      else if (msg.includes('403')) onToast('You do not have permission for this action')
      else onToast('Could not rotate link')
    }
  }

  const handleRevoke = async (role: string) => {
    if (!serverRoadmapId) return
    if (!sessionToken) {
      onToast('Session expired — rejoin from the invite link')
      return
    }
    try {
      await revokeShareLink(serverRoadmapId, role, sessionToken)
      setLinks((prev) => prev.filter((l) => l.role !== role))
      onToast('Link revoked')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('401')) onToast('Session expired — rejoin from the invite link')
      else if (msg.includes('403')) onToast('You do not have permission for this action')
      else onToast('Could not revoke link')
    }
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
            <Icon name="lock" size={12} />{' '}
            {isPasswordEnabled
              ? 'This roadmap is password protected — people need both the invite link and the password to join.'
              : 'Share links carefully — anyone with a link can join with that role.'}
          </span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="share-list">
        {loading && (
          <div style={{ padding: '12px 0', color: 'var(--ink-4)', fontSize: 13 }}>
            Loading share links…
          </div>
        )}
        {!loading &&
          links.map((link) => (
            <div key={link.role} className={`share-row ${link.recommended ? 'recommended' : ''}`}>
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
                  {link.recommended && <span className="badge ember">Recommended</span>}
                </div>
                <div className="d">{link.desc}</div>
              </div>
              <div className="link-line">
                {link.url ? (
                  <>
                    <code>{link.url}</code>
                    <button
                      className={`copy ${copied === link.role ? 'copied' : ''}`}
                      onClick={() => copy(link.role, link.url)}
                    >
                      {copied === link.role ? (
                        <>
                          <Icon name="check" size={13} /> Copied
                        </>
                      ) : (
                        <>
                          <Icon name="link" size={13} /> Copy
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>
                    Rotate to generate a copyable link
                  </span>
                )}
              </div>
              <div className="actions">
                <button className="mini" onClick={() => handleRegenerate(link.role)}>
                  <Icon name="link" size={12} /> Regenerate
                </button>
                <button className="mini" onClick={() => handleRevoke(link.role)}>
                  <Icon name="x" size={12} /> Revoke
                </button>
              </div>
            </div>
          ))}
      </div>
    </Modal>
  )
}
