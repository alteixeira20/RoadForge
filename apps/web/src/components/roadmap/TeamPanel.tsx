'use client'

import { Icon } from '@/components/ui/Icon'
import type { Participant } from '@/types/roadmap'

interface TeamPanelProps {
  participants: Participant[]
  onClose: () => void
}

export function TeamPanel({ participants, onClose }: TeamPanelProps) {
  const activeParticipants = participants.filter((participant) => !participant.revokedAt)

  const formatDate = (value: string | null) => {
    if (!value) return 'Never'
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="activity-panel team-panel">
      <div className="panel-head">
        <h3>Team</h3>
        <button className="close-btn" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="panel-body">
        {activeParticipants.length === 0 ? (
          <div className="state-msg">
            <Icon name="users" size={24} />
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
                    </div>
                    <div className="team-counts">
                      {participant.accessSourceLabel || 'Legacy / unknown link'}
                      {participant.isCurrentParticipant && <span className="team-inline-badge">Current session</span>}
                    </div>
                  </div>
                </div>
                <div className="team-meta">
                  Joined {formatDate(participant.createdAt)} · Last seen {formatDate(participant.lastSeenAt)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
