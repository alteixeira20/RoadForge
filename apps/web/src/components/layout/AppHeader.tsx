'use client'

import { Icon } from '@/components/ui/Icon'
import { Brand } from '@/components/ui/Brand'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { RoadmapSwitcher } from '@/components/roadmap/RoadmapSwitcher'

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
  saved,
  readOnly = false,
  onSave,
  onShare,
  onIO,
  onCreateOwn,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <Brand href="/" className="brand-mini" />

      <div className="crumbs">
        <span>RoadForge</span>
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
        <RoadmapSwitcher />
      </div>
    </header>
  )
}
