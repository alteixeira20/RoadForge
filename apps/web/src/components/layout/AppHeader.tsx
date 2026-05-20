'use client'

import { Icon } from '@/components/ui/Icon'
import { Brand } from '@/components/ui/Brand'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { RoadmapSwitcher } from '@/components/roadmap/RoadmapSwitcher'
import type { SyncStatus } from '@/types/roadmap'

const BADGE_LABEL: Record<SyncStatus, string> = {
  local: 'LOCAL',
  live: 'LIVE',
  syncing: 'SYNCING',
  offline: 'OFFLINE',
}

interface AppHeaderProps {
  roadmapName: string
  displayName: string
  syncStatus: SyncStatus
  readOnly?: boolean
  onSave?: () => void
  onShare?: () => void
  onIO?: () => void
  onCreateOwn?: () => void
}

export function AppHeader({
  roadmapName,
  syncStatus,
  readOnly = false,
  onSave,
  onShare,
  onIO,
  onCreateOwn,
}: AppHeaderProps) {
  const isServerBacked = syncStatus !== 'local'

  return (
    <header className="app-header">
      <Brand href="/" className="brand-mini" />

      <div className="crumbs">
        <span>RoadForge</span>
        <span className="sep">/</span>
        <span className="active">{roadmapName}</span>
      </div>

      {!readOnly && (
        <span className={`badge ${syncStatus}`} title={syncStatus === 'offline' ? 'API unreachable — changes saved locally' : undefined}>
          <span className="dot" />
          {BADGE_LABEL[syncStatus]}
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
              onClick={isServerBacked ? onShare : onSave}
            >
              <Icon name="share" size={16} />
            </button>
            {!isServerBacked ? (
              <button
                className="btn sm header-save-btn"
                onClick={onSave}
                title="Save to RoadForge"
                aria-label="Save to RoadForge"
              >
                <Icon name="cloud" size={14} />
                <span className="header-save-label">Save</span>
              </button>
            ) : syncStatus === 'offline' ? (
              <button
                className="btn sm header-save-btn"
                onClick={onSave}
                title="Retry sync"
                aria-label="Retry sync"
              >
                <Icon name="cloud" size={14} />
                <span className="header-save-label">Retry</span>
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
