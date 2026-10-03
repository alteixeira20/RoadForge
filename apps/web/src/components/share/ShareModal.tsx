'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { getParticipants, getShareLinks, regenerateShareLink, revokeParticipant, revokeShareLink, updateRoadmapPassword } from '@/services/roadmap-sharing.service'
import { useRoadmapData, useRoadmapSession } from '@/context/RoadmapContext'
import { ShareRoleSection } from '@/components/share/ShareRoleSection'
import { isApiError, isAuthError } from '@/services/roadmap-http'
import type { Participant, ShareLink, ShareRole } from '@/types/roadmap'

const SHARE_ROLES: ShareRole[] = ['owner', 'editor', 'viewer']

const ROLE_COPY: Record<ShareRole, { title: string; peopleTitle: string }> = {
  owner: { title: 'Private owner link', peopleTitle: 'Owner' },
  editor: { title: 'Private editor invite', peopleTitle: 'Editor' },
  viewer: { title: 'Read-only viewer invite', peopleTitle: 'Viewer' },
}

interface ShareModalProps {
  open: boolean
  onClose: () => void
  onToast: (msg: string) => void
}

export function ShareModal({ open, onClose, onToast }: ShareModalProps) {
  const { serverRoadmapId, sessionToken, role } = useRoadmapSession()
  const { isPasswordEnabled, setIsPasswordEnabled } = useRoadmapData()
  const [links, setLinks] = useState<ShareLink[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(false)
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [ownerOnly, setOwnerOnly] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
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
    setPasswordInput('')
    setShowPasswordForm(false)
    setPasswordLoading(false)
    setPasswordError(null)
    if (!canManageShare) {
      setLinks([])
      setLoading(false)
      setParticipantsLoading(false)
      setOwnerOnly(true)
      return
    }
    if (!serverRoadmapId) {
      setLinks([])
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

  const formatDate = (value: string | null | undefined) => {
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
        ? 'Full control - manage settings, links, and members.'
        : targetRole === 'editor'
        ? 'Can edit phases, tasks, and dependencies. Cannot delete the roadmap.'
        : 'Read-only roadmap access. Treat this invite as a private credential.',
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
    if (link.isActive) return `Rotate to reveal a new ${targetRole} invite`
    return `No active ${targetRole} invite`
  }

  const rotateLabel = (_targetRole: ShareRole) => 'Rotate link'

  const revokeLabel = (_targetRole: ShareRole) => 'Revoke link'

  const generateLabel = (_targetRole: ShareRole) => 'Generate invite'

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
      onToast('New link generated - copy it now')
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

  const handleSavePassword = async () => {
    if (!serverRoadmapId || !sessionToken) return
    const trimmed = passwordInput.trim()
    if (!trimmed || trimmed.length < 6) {
      setPasswordError('Password must be at least 6 characters.')
      return
    }
    if (trimmed.length > 128) {
      setPasswordError('Password must be at most 128 characters.')
      return
    }
    setPasswordLoading(true)
    setPasswordError(null)
    try {
      const res = await updateRoadmapPassword(serverRoadmapId, trimmed, sessionToken)
      setIsPasswordEnabled(res.isPasswordEnabled)
      const wasEnabled = isPasswordEnabled
      setPasswordInput('')
      setShowPasswordForm(false)
      onToast(wasEnabled ? 'Password changed' : 'Password set')
    } catch (err: unknown) {
      if (isAuthError(err)) {
        onToast('Only the owner can manage the roadmap password.')
      } else if (err instanceof Error) {
        setPasswordError(err.message)
      } else {
        setPasswordError('Failed to update password')
      }
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleRemovePassword = async () => {
    if (!serverRoadmapId || !sessionToken) return
    setPasswordLoading(true)
    setPasswordError(null)
    try {
      const res = await updateRoadmapPassword(serverRoadmapId, null, sessionToken)
      setIsPasswordEnabled(res.isPasswordEnabled)
      setPasswordInput('')
      setShowPasswordForm(false)
      onToast('Password removed')
    } catch (err: unknown) {
      if (isAuthError(err)) {
        onToast('Only the owner can manage the roadmap password.')
      } else if (err instanceof Error) {
        setPasswordError(err.message)
      } else {
        setPasswordError('Failed to remove password')
      }
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={580}
      icon={{ name: 'share', plain: true }}
      title="Share this roadmap"
      sub="Create role-scoped invite links for collaborators. Viewer invites are read-only access credentials."
      footer={
        <>
          <span className="note">
            <Icon name="lock" size={12} />{' '}
            {isPasswordEnabled
              ? 'This roadmap is password protected - people need both the invite link and the password to join.'
              : 'Owner, editor, and viewer invite links are access credentials. Viewer invites are read-only, not public publishing links.'}
          </span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      {!ownerOnly && serverRoadmapId && (
        <>
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

          <div className="roadmap-password-section">
            <div className="roadmap-password-header">
              <div className="roadmap-password-title">
                <Icon name="lock" size={15} />
                <span>Roadmap password</span>
                <span className={`badge ${isPasswordEnabled ? 'ember' : ''}`}>
                  {isPasswordEnabled ? 'Password protected' : 'No password required'}
                </span>
              </div>
              {!showPasswordForm && (
                <div className="roadmap-password-actions">
                  {isPasswordEnabled ? (
                    <>
                      <button
                        type="button"
                        className="mini"
                        onClick={() => {
                          setShowPasswordForm(true)
                          setPasswordError(null)
                        }}
                        disabled={passwordLoading}
                      >
                        Change password
                      </button>
                      <button
                        type="button"
                        className="mini danger"
                        onClick={handleRemovePassword}
                        disabled={passwordLoading}
                      >
                        {passwordLoading ? 'Removing...' : 'Remove password'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="mini"
                      onClick={() => {
                        setShowPasswordForm(true)
                        setPasswordError(null)
                      }}
                      disabled={passwordLoading}
                    >
                      Set password
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="roadmap-password-desc">
              {isPasswordEnabled
                ? 'Collaborators must provide this password when accessing via invite links.'
                : 'Require a password in addition to invite links to access this roadmap.'}
            </div>
            {showPasswordForm && (
              <div className="roadmap-password-form">
                <div className="roadmap-password-inputs">
                  <input
                    type="password"
                    className="roadmap-password-input"
                    placeholder={isPasswordEnabled ? 'Enter new password (min. 6 characters)' : 'Enter password (min. 6 characters)'}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value)
                      setPasswordError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSavePassword()
                      }
                    }}
                    disabled={passwordLoading}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="mini primary"
                    onClick={handleSavePassword}
                    disabled={passwordLoading || !passwordInput.trim()}
                  >
                    {passwordLoading ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="mini"
                    onClick={() => {
                      setShowPasswordForm(false)
                      setPasswordInput('')
                      setPasswordError(null)
                    }}
                    disabled={passwordLoading}
                  >
                    Cancel
                  </button>
                </div>
                {passwordError && (
                  <div className="roadmap-password-error">{passwordError}</div>
                )}
              </div>
            )}
          </div>
        </>
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
