'use client'

interface RoadmapSwitcherInviteFormProps {
  inviteLink: string
  password: string
  needsPassword: boolean
  joining: boolean
  error: string | null
  onInviteLinkChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onJoin: () => void
  onCancel: () => void
}

export function RoadmapSwitcherInviteForm({
  inviteLink,
  password,
  needsPassword,
  joining,
  error,
  onInviteLinkChange,
  onPasswordChange,
  onJoin,
  onCancel,
}: RoadmapSwitcherInviteFormProps) {
  return (
    <div className="switcher-invite-form">
      <input
        type="text"
        placeholder="Paste invite link or token..."
        value={inviteLink}
        onChange={(e) => onInviteLinkChange(e.target.value)}
        className="switcher-field"
        autoFocus
      />
      {needsPassword && (
        <input
          type="password"
          placeholder="Roadmap password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          className="switcher-field"
        />
      )}
      {error && <div className="switcher-error">{error}</div>}
      <div className="switcher-invite-actions">
        <button className="btn sm primary" onClick={onJoin} disabled={joining}>
          {joining ? 'Joining...' : 'Join'}
        </button>
        <button className="btn sm ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
