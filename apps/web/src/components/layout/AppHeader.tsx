'use client'

import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

interface AppHeaderProps {
  roadmapName: string
  displayName: string
  saved: boolean
  readOnly?: boolean
  onSave?: () => void
  onShare?: () => void
  onIO?: () => void
  onCreateOwn?: () => void
}

export function AppHeader({
  roadmapName,
  displayName,
  saved,
  readOnly = false,
  onSave,
  onShare,
  onIO,
  onCreateOwn,
}: AppHeaderProps) {
  const initials = ((displayName || 'You')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('') || 'Y'
  ).toUpperCase()

  return (
    <header className="app-header">
      <Link href="/" className="brand-mini" style={{ cursor: 'pointer', textDecoration: 'none' }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: 'linear-gradient(180deg, #2a2018, #161114)',
            border: '1px solid var(--border-strong)',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 50% 110%, var(--molten), transparent 60%)',
              opacity: 0.95,
            }}
          />
          <Icon name="anvil" size={13} stroke="#f5853f" strokeWidth={1.7} />
        </div>
        <span>Roadforge</span>
      </Link>

      <div className="crumbs">
        <span>Roadforge</span>
        <span className="sep">/</span>
        <span className="active">{roadmapName}</span>
      </div>

      {!readOnly && (
        <span className={`badge ${saved ? 'synced' : ''}`}>
          <span className="dot" />
          {saved ? 'SYNCED' : 'LOCAL ONLY'}
        </span>
      )}
      {readOnly && (
        <span className="badge">
          <span className="dot" />
          READ ONLY
        </span>
      )}

      <span className="spacer" />

      <div className="actions">
        {!readOnly && (
          <>
            <button className="iconbtn" title="Import / Export" onClick={onIO}>
              <Icon name="export" size={16} />
            </button>
            <button
              className="iconbtn"
              title="Share"
              onClick={saved ? onShare : onSave}
            >
              <Icon name="share" size={16} />
            </button>
            {!saved ? (
              <button className="btn sm" onClick={onSave}>
                <Icon name="cloud" size={14} /> Save to server
              </button>
            ) : (
              <button className="btn sm" onClick={onShare}>
                <Icon name="share" size={14} /> Share
              </button>
            )}
          </>
        )}
        {readOnly && (
          <button className="btn sm primary" onClick={onCreateOwn}>
            <Icon name="plus" size={14} stroke="#fff" /> Create your own
          </button>
        )}
        <ThemeToggle />
        <span className="avatar" title={displayName}>
          {initials}
        </span>
      </div>
    </header>
  )
}
