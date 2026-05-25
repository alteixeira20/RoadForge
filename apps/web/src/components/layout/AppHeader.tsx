'use client'

import { Icon } from '@/components/ui/Icon'
import { Brand } from '@/components/ui/Brand'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { RoadmapSwitcher } from '@/components/roadmap/RoadmapSwitcher'
import { HeaderMoreMenu } from '@/components/layout/HeaderMoreMenu'
import type { SyncStatus } from '@/types/roadmap'

const BADGE_LABEL: Record<SyncStatus, string> = {
  local: 'LOCAL',
  live: 'LIVE',
  syncing: 'SYNCING',
  offline: 'OFFLINE',
  conflict: 'CONFLICT',
}

interface AppHeaderProps {
  roadmapName: string
  displayName: string
  syncStatus: SyncStatus
  readOnly?: boolean
  canManageShare?: boolean
  onSave?: () => void
  onShare?: () => void
  onIO?: () => void
  onCreateOwn?: () => void
  onReloadServerVersion?: () => void
}

export function AppHeader({
  roadmapName,
  syncStatus,
  readOnly = false,
  canManageShare = false,
  onSave,
  onShare,
  onIO,
  onCreateOwn,
  onReloadServerVersion,
}: AppHeaderProps) {
  const isServerBacked = syncStatus !== 'local'

  return (
    <header className="app-header">
      <Brand href="/" className="brand-mini" />

      <div className="crumbs">
        <span className="active">{roadmapName}</span>
      </div>

      {!readOnly && (
        <span
          className={`badge ${syncStatus}`}
          title={
            syncStatus === 'offline' ? 'API unreachable — changes saved locally' :
            syncStatus === 'conflict' ? 'Roadmap changed elsewhere — local edits preserved' :
            undefined
          }
        >
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

      {/* Session switcher — row 1 right on mobile, ordered after .actions on desktop */}
      <RoadmapSwitcher />

      <div className="actions">
        {!readOnly && (
          <>
            {/* Secondary icon buttons */}
            <div className="header-secondary">
              <button className="iconbtn" title="Import / Export" onClick={onIO}>
                <Icon name="export" size={16} />
              </button>
              {(!isServerBacked || canManageShare) && (
                <button
                  className="iconbtn"
                  title={isServerBacked ? 'Share' : 'Save to RoadForge'}
                  onClick={isServerBacked ? onShare : onSave}
                >
                  <Icon name={isServerBacked ? 'share' : 'cloud'} size={16} />
                </button>
              )}
            </div>
            {/* Primary action — always visible */}
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
            ) : syncStatus === 'conflict' ? (
              <button
                className="btn sm header-save-btn"
                onClick={onReloadServerVersion}
                title="Reload server version"
                aria-label="Reload server version"
              >
                <Icon name="cloud" size={14} />
                <span className="header-save-label">Reload</span>
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
            ) : canManageShare ? (
              <button className="btn sm" onClick={onShare}>
                <Icon name="share" size={14} /> Share
              </button>
            ) : null}
          </>
        )}
        {readOnly && (
          <button className="btn sm primary" onClick={onCreateOwn}>
            <Icon name="plus" size={14} stroke="#fff" /> Create your own
          </button>
        )}
        {/* Theme toggle */}
        <div className="header-secondary">
          <ThemeToggle />
        </div>
        {/* More menu — hidden on mobile and desktop, kept for potential reuse */}
        <HeaderMoreMenu onIO={!readOnly ? onIO : undefined} />
      </div>
    </header>
  )
}
