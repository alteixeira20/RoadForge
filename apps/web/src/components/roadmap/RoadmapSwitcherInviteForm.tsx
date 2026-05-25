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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px' }}>
      <input
        type="text"
        placeholder="Paste invite link or token..."
        value={inviteLink}
        onChange={(e) => onInviteLinkChange(e.target.value)}
        style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', background: 'var(--bg-3)', color: 'var(--ink)' }}
        autoFocus
      />
      {needsPassword && (
        <input
          type="password"
          placeholder="Roadmap password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border-strong)', background: 'var(--bg-3)', color: 'var(--ink)' }}
        />
      )}
      {error && <div style={{ fontSize: 11, color: 'var(--ember)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn sm primary" onClick={onJoin} disabled={joining} style={{ flex: 1 }}>
          {joining ? 'Joining...' : 'Join'}
        </button>
        <button className="btn sm ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
