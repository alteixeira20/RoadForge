'use client'

import { Icon } from '@/components/ui/Icon'
import type { Participant } from '@/types/roadmap'

interface TeamPanelProps {
  participants: Participant[]
  loading: boolean
  error: string | null
  canManageParticipants: boolean
  onInvite: () => void
  onRevokeParticipant: (participant: Participant) => Promise<void>
  onBack: () => void
  claimedCountByParticipantId?: Record<string, number>
}

export function TeamPanel({
  participants,
  loading,
  error,
  canManageParticipants,
  onInvite,
  onRevokeParticipant,
  onBack,
  claimedCountByParticipantId = {},
}: TeamPanelProps) {
  const activeParticipants = participants.filter((participant) => !participant.revokedAt)
  const accessLabelFor = (participant: Participant) => (
    participant.accessSourceLabel ||
    (participant.joinedViaRole ? `${participant.joinedViaRole} link` : 'Legacy / unknown link')
  )

  const formatDate = (value: string | null) => {
    if (!value) return 'Never'
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatSessionExpiry = (value: string | null) => (
    value ? formatDate(value) : 'not set'
  )

  return (
    <section className="team-view">
      <div className="team-view-head">
        <div>
          <h2>Team</h2>
          <p>People with active access to this synced roadmap.</p>
        </div>
        <div className="team-actions">
          <button className="btn sm ghost" onClick={onBack}>
            <Icon name="fold" size={13} /> Roadmap
          </button>
          {canManageParticipants && (
            <button className="btn sm" onClick={onInvite}>
              <Icon name="share" size={13} /> Invite
            </button>
          )}
        </div>
      </div>

      <div className="team-invite-note">
        Invite people by creating or rotating owner, editor, or viewer links.
      </div>

      {loading ? (
        <div className="team-state">
          <Icon name="activity" size={20} />
          <p>Loading team members...</p>
        </div>
      ) : error ? (
        <div className="team-state error">
          <Icon name="x" size={20} />
          <p>{error}</p>
        </div>
      ) : activeParticipants.length === 0 ? (
        <div className="team-state">
          <Icon name="users" size={22} />
          <p>No joined collaborators visible yet.</p>
        </div>
      ) : (
        <div className="team-list">
          {activeParticipants.map((participant) => (
            <section key={participant.id} className="team-group">
              <div className="team-group-head">
                <div>
                  <div className="team-name">
                    {participant.displayName}
                    <span>{participant.role}</span>
                    {participant.isCurrentParticipant && <span>Current session</span>}
                  </div>
                  <div className="team-counts">
                    {accessLabelFor(participant)}
                  </div>
                </div>
                <div className="team-row-actions">
                  {canManageParticipants && !participant.isCurrentParticipant && (
                    <button className="mini" onClick={() => { void onRevokeParticipant(participant) }}>
                      <Icon name="x" size={12} /> Revoke user
                    </button>
                  )}
                </div>
              </div>
              <div className="team-meta">
                Joined {formatDate(participant.createdAt)} · Last seen {formatDate(participant.lastSeenAt)} · Session expires: {formatSessionExpiry(participant.sessionExpiresAt)}
                {(claimedCountByParticipantId[participant.id] ?? 0) > 0 && (
                  <span className="team-claim-badge">
                    Working on {claimedCountByParticipantId[participant.id]} task{claimedCountByParticipantId[participant.id] === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
