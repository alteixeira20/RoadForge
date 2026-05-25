'use client'

import { Icon } from '@/components/ui/Icon'
import type { Participant } from '@/types/roadmap'

interface ParticipantRowProps {
  participant: Participant
  roleTitle: string
  formattedCreatedAt: string
  formattedLastSeenAt: string
  onRevoke: (participant: Participant) => void
}

export function ParticipantRow({
  participant,
  roleTitle,
  formattedCreatedAt,
  formattedLastSeenAt,
  onRevoke,
}: ParticipantRowProps) {
  return (
    <div className="participant-row">
      <div className="participant-main">
        <div className="participant-name">
          {participant.displayName}
          <span className="badge">{roleTitle}</span>
          {participant.isCurrentParticipant && <span className="badge ember">Current session</span>}
        </div>
        <div className="participant-meta">
          {participant.accessSourceLabel || 'Legacy / unknown link'} · Joined {formattedCreatedAt} · Last seen {formattedLastSeenAt}
        </div>
      </div>
      {!participant.isCurrentParticipant && (
        <button className="mini" onClick={() => onRevoke(participant)}>
          <Icon name="x" size={12} /> Revoke user
        </button>
      )}
    </div>
  )
}
