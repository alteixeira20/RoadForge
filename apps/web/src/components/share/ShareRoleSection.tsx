'use client'

import { Icon } from '@/components/ui/Icon'
import { ParticipantRow } from '@/components/share/ParticipantRow'
import type { Participant, ShareLink, ShareRole } from '@/types/roadmap'
import type { IconName } from '@/components/ui/Icon'

interface RoleCopy {
  title: string
  peopleTitle: string
}

interface ShareRoleSectionProps {
  targetRole: ShareRole
  link: ShareLink
  roleCopy: RoleCopy
  roleParticipants: Participant[]
  expanded: boolean
  copied: string | null
  participantsLoading: boolean
  onToggle: () => void
  onCopy: (role: string, url: string) => void
  onRegenerate: (targetRole: ShareRole) => void
  onRevokeLink: (targetRole: ShareRole) => void
  onRevokeParticipant: (participant: Participant) => void
  formatDate: (value: string | null | undefined) => string
  linkStateLabel: (link: ShareLink) => string
  linkHint: (targetRole: ShareRole, link: ShareLink) => string
  rotateLabel: (targetRole: ShareRole) => string
  revokeLabel: (targetRole: ShareRole) => string
  generateLabel: (targetRole: ShareRole) => string
  getParticipantRoleTitle: (role: ShareRole) => string
}

export function ShareRoleSection({
  targetRole,
  link,
  roleCopy,
  roleParticipants,
  expanded,
  copied,
  participantsLoading,
  onToggle,
  onCopy,
  onRegenerate,
  onRevokeLink,
  onRevokeParticipant,
  formatDate,
  linkStateLabel,
  linkHint,
  rotateLabel,
  revokeLabel,
  generateLabel,
  getParticipantRoleTitle,
}: ShareRoleSectionProps) {
  return (
    <section className={`share-role-section ${link.recommended ? 'recommended' : ''}`}>
      <button
        type="button"
        className="share-role-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="ic">
          <Icon name={link.icon as IconName} size={16} />
        </span>
        <span className="share-role-title">
          <span>{roleCopy.title}</span>
          <span className={`link-state ${link.isActive ? 'active' : ''}`}>
            {linkStateLabel(link)}
          </span>
        </span>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
      </button>

      {expanded && (
        <div className="share-role-body">
          <div className="share-row compact">
            <div className="meta">
              <div className="h">
                {roleCopy.title}
                {link.recommended && <span className="badge ember">Recommended</span>}
              </div>
              <div className="d">{link.desc}</div>
            </div>
            <div className="link-line">
              {link.isActive && link.url ? (
                <>
                  <code>{link.url}</code>
                  <button
                    className={`copy ${copied === link.role ? 'copied' : ''}`}
                    onClick={() => onCopy(link.role, link.url)}
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
                <span className="link-hint">{linkHint(targetRole, link)}</span>
              )}
            </div>
            <div className="actions">
              {link.isActive ? (
                <>
                  <button className="mini" onClick={() => onRegenerate(link.role)}>
                    <Icon name="link" size={12} /> {rotateLabel(targetRole)}
                  </button>
                  <button className="mini" onClick={() => onRevokeLink(link.role)}>
                    <Icon name="x" size={12} /> {revokeLabel(targetRole)}
                  </button>
                </>
              ) : (
                <button className="mini" onClick={() => onRegenerate(link.role)}>
                  <Icon name="link" size={12} /> {generateLabel(targetRole)}
                </button>
              )}
            </div>
            {targetRole === 'viewer' && link.isActive && link.url && (
              <div className="share-role-note neutral">
                Anyone with this link can view this roadmap read-only. It is suitable for a README, portfolio, or live demo.
              </div>
            )}
            {!link.isActive && roleParticipants.length > 0 && (
              <div className="share-role-note">
                Existing users keep access until revoked individually.
              </div>
            )}
          </div>

          <div className="participants-section">
            <div className="section-heading">
              <span>Joined users</span>
              {participantsLoading && <span className="muted">Loading…</span>}
            </div>
            <div className="participants-list">
              {!participantsLoading && roleParticipants.length === 0 && (
                <div className="participant-row muted">No joined users for this role.</div>
              )}
              {roleParticipants.map((participant) => (
                <ParticipantRow
                  key={participant.id}
                  participant={participant}
                  roleTitle={getParticipantRoleTitle(participant.role)}
                  formattedCreatedAt={formatDate(participant.createdAt)}
                  formattedLastSeenAt={formatDate(participant.lastSeenAt)}
                  onRevoke={onRevokeParticipant}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
