'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { MOCK_SHARE_LINKS } from '@/data/sample-roadmap'
import { getParticipants, getShareLinks, regenerateShareLink, revokeParticipant, revokeShareLink } from '@/services/roadmap-sharing.service'
import { useRoadmapData, useRoadmapSession } from '@/context/RoadmapContext'
import { ShareRoleSection } from '@/components/share/ShareRoleSection'
import { isApiError, isAuthError } from '@/services/roadmap-http'
import type { Participant, ShareLink, ShareRole } from '@/types/roadmap'

const SHARE_ROLES: ShareRole[] = ['owner', 'editor', 'viewer']

const ROLE_COPY: Record<ShareRole, { title: string; peopleTitle: string }> = {
  owner: { title: 'Private owner link', peopleTitle: 'Owner' },
  editor: { title: 'Private editor invite', peopleTitle: 'Editor' },
  viewer: { title: 'Public viewer link', peopleTitle: 'Viewer' },
}

interface ShareModalProps {
  open: boolean
  onClose: () => void
  onToast: (msg: string) => void
}

export function ShareModal({ open, onClose, onToast }: ShareModalProps) {
  const { serverRoadmapId, sessionToken, role } = useRoadmapSession()
  const { isPasswordEnabled } = useRoadmapData()
  const [links, setLinks] = useState<ShareLink[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(false)
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [ownerOnly, setOwnerOnly] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [expandedRoles, setExpandedRoles] = useState<Record<ShareRole, boolean>>({
    owner: true,
    editor: true,
    viewer: true,
  })
  const canManageShare = role === 'owner'
  const roadmapUrl = serverRoadmapId && typeof window !== 'undefined'
    ? `${window.location.origin}/workspace?roadmap=${encodeURIComponent(serverRoadmapId)}`
    : null

  useEffect(() => {
    if (!open) return
    setOwnerOnly(false)
    setParticipants([])
    if (!canManageShare) {
      setLinks([])
      setLoading(false)
      setParticipantsLoading(false)
      setOwnerOnly(true)
      return
    }
    if (!serverRoadmapId) {
      setLinks(MOCK_SHARE_LINKS)
      setParticipants([])
      setLoading(false)
      setParticipantsLoading(false)
      return
    }
    if (!sessionToken) {
      setLinks([])
      setParticipants([])
      setOwnerOnly(true)
      return
    }
    let cancelled = false
    setLoading(true)
    setParticipantsLoading(true)
    getShareLinks(serverRoadmapId, sessionToken)
      .then((data) => { if (!cancelled) setLinks(data) })
      .catch((err) => {
        if (cancelled) return
        if (isAuthError(err)) {
          setOwnerOnly(true)
          onToast('Only the owner can manage share links.')
        } else {
          onToast('Could not load share links')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    getParticipants(serverRoadmapId, sessionToken)
      .then((data) => { if (!cancelled) setParticipants(data) })
      .catch((err) => {
        if (cancelled) return
        if (isAuthError(err)) {
          setOwnerOnly(true)
          onToast('Only the owner can manage share links.')
        } else {
          onToast('Could not load participants')
        }
      })
      .finally(() => { if (!cancelled) setParticipantsLoading(false) })
    return () => { cancelled = true }
  }, [open, serverRoadmapId, sessionToken, canManageShare, onToast])

  const copy = (role: string, url: string) => {
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {})
    setCopied(role)
    setTimeout(() => setCopied(null), 1600)
  }

  const formatDate = (value: string | null) => {
    if (!value) return 'Never'
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const toggleRole = (targetRole: ShareRole) => {
    setExpandedRoles((prev) => ({ ...prev, [targetRole]: !prev[targetRole] }))
  }

  const linkForRole = (targetRole: ShareRole): ShareLink => (
    links.find((link) => link.role === targetRole) ?? {
      id: null,
      role: targetRole,
      icon: targetRole === 'owner' ? 'shield' : targetRole === 'editor' ? 'users' : 'circle',
      desc: targetRole === 'owner'
        ? 'Full control — manage settings, links, and members.'
        : targetRole === 'editor'
        ? 'Can edit phases, tasks, and dependencies. Cannot delete the roadmap.'
        : 'Can read everything but not change anything. Good for stakeholders.',
      url: '',
      isActive: false,
    }
  )

  const activeParticipantsForRole = (targetRole: ShareRole, link: ShareLink) => (
    participants.filter((participant) => (
      !participant.revokedAt && (
        participant.role === targetRole ||
        (!!link.id && participant.shareLinkId === link.id)
      )
    ))
  )

  const linkStateLabel = (link: ShareLink) => {
    if (link.isActive) return 'active'
    if (link.id) return 'revoked/inactive'
    return 'not generated'
  }

  const linkHint = (targetRole: ShareRole, link: ShareLink) => {
    if (link.isActive && targetRole === 'viewer') {
      return 'Reset link to make this public viewer URL copyable'
    }
    if (link.isActive) return 'Rotate to reveal a new link'
    if (targetRole === 'viewer') return 'No active public viewer link'
    return 'No active invite link'
  }

  const rotateLabel = (targetRole: ShareRole) => (
    targetRole === 'viewer' ? 'Reset link' : 'Rotate link'
  )

  const revokeLabel = (targetRole: ShareRole) => (
    targetRole === 'viewer' ? 'Disable link' : 'Revoke link'
  )

  const generateLabel = (targetRole: ShareRole) => (
    targetRole === 'viewer' ? 'Generate public link' : 'Generate link'
  )

  const replaceRoleLink = (updated: ShareLink) => {
    setLinks((prev) => prev.map((l) => (l.role === updated.role ? updated : l)))
  }

  const markRoleInactive = (targetRole: string) => {
    setLinks((prev) => prev.map((l) => (
      l.role === targetRole ? { ...l, url: '', isActive: false } : l
    )))
  }

  const handleRegenerate = async (targetRole: ShareRole) => {
    if (!serverRoadmapId) return
    if (!canManageShare || !sessionToken) {
      onToast('Only the owner can manage share links.')
      return
    }
    try {
      const updated = await regenerateShareLink(serverRoadmapId, targetRole, sessionToken)
      replaceRoleLink(updated)
      onToast('New link generated — copy it now')
    } catch (err) {
      if (isAuthError(err)) onToast('Only the owner can manage share links.')
      else onToast('Could not rotate link')
    }
  }

  const handleRevoke = async (targetRole: ShareRole) => {
    if (!serverRoadmapId) return
    if (!canManageShare || !sessionToken) {
      onToast('Only the owner can manage share links.')
      return
    }
    try {
      await revokeShareLink(serverRoadmapId, targetRole, sessionToken)
      markRoleInactive(targetRole)
      onToast('Link revoked')
    } catch (err) {
      if (isAuthError(err)) onToast('Only the owner can manage share links.')
      else onToast('Could not revoke link')
    }
  }

  const refreshParticipants = async () => {
    if (!serverRoadmapId || !sessionToken) return
    setParticipantsLoading(true)
    try {
      setParticipants(await getParticipants(serverRoadmapId, sessionToken))
    } catch {
      onToast('Could not load participants')
    } finally {
      setParticipantsLoading(false)
    }
  }

  const handleRevokeParticipant = async (participant: Participant) => {
    if (!serverRoadmapId || !sessionToken) return
    if (participant.isCurrentParticipant) {
      onToast('You cannot revoke your current owner session.')
      return
    }
    try {
      await revokeParticipant(serverRoadmapId, participant.id, sessionToken)
      onToast('Participant revoked')
      await refreshParticipants()
    } catch (err) {
      if (isAuthError(err)) onToast('Only the owner can manage participants.')
      else if (isApiError(err, 400)) onToast('You cannot revoke your current owner session.')
      else onToast('Could not revoke participant')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={580}
      icon={{ name: 'share', plain: true }}
      title="Share this roadmap"
      sub="Use private invite links for collaborators and a public read-only link for demos."
      footer={
        <>
          <span className="note">
            <Icon name="lock" size={12} />{' '}
            {isPasswordEnabled
              ? 'This roadmap is password protected — people need both the invite link and the password to join.'
              : 'The public viewer link is read-only. Owner and editor links are private credentials.'}
          </span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      {!ownerOnly && serverRoadmapId && (
        <div className="owner-access">
          <div className="note-line compact">
            <span className="ic">
              <Icon name="shield" size={14} />
            </span>
            <span>
              This browser is connected as owner. To access as owner from another
              browser, save or generate an owner invite link.
            </span>
          </div>
          {roadmapUrl && (
            <div className="share-row compact">
              <div className="ic">
                <Icon name="link" size={15} />
              </div>
              <div className="meta">
                <div className="h">Current roadmap URL</div>
                <div className="d">Use this URL with an owner session in this browser.</div>
              </div>
              <div className="link-line">
                <code>{roadmapUrl}</code>
                <button
                  className={`copy ${copied === 'roadmap-url' ? 'copied' : ''}`}
                  onClick={() => copy('roadmap-url', roadmapUrl)}
                >
                  {copied === 'roadmap-url' ? (
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
            </div>
          )}
          <div className="note-line compact warning">
            <span className="ic">
              <Icon name="lock" size={14} />
            </span>
            <span>
              Owner links grant full control. Store carefully. Rotate/generate an
              owner link to reveal a new owner invite.
            </span>
          </div>
        </div>
      )}

      <div className="share-list">
        {loading && (
          <div className="share-list-status">Loading share links…</div>
        )}
        {!loading && ownerOnly && (
          <div className="share-list-status">Owner only</div>
        )}
        {!loading && !ownerOnly && SHARE_ROLES.map((targetRole) => {
          const link = linkForRole(targetRole)
          const roleParticipants = activeParticipantsForRole(targetRole, link)
          return (
            <ShareRoleSection
              key={targetRole}
              targetRole={targetRole}
              link={link}
              roleCopy={ROLE_COPY[targetRole]}
              roleParticipants={roleParticipants}
              expanded={expandedRoles[targetRole]}
              copied={copied}
              participantsLoading={participantsLoading}
              onToggle={() => toggleRole(targetRole)}
              onCopy={copy}
              onRegenerate={handleRegenerate}
              onRevokeLink={handleRevoke}
              onRevokeParticipant={handleRevokeParticipant}
              formatDate={formatDate}
              linkStateLabel={linkStateLabel}
              linkHint={linkHint}
              rotateLabel={rotateLabel}
              revokeLabel={revokeLabel}
              generateLabel={generateLabel}
              getParticipantRoleTitle={(role) => ROLE_COPY[role].peopleTitle}
            />
          )
        })}
      </div>
    </Modal>
  )
}
