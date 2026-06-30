'use client'

import { Icon } from '@/components/ui/Icon'
import { Brand } from '@/components/ui/Brand'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { RoadmapSwitcher } from '@/components/roadmap/RoadmapSwitcher'
import type { SyncStatus } from '@/types/roadmap'

interface AppHeaderProps {
  roadmapName: string
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
      <div className="header-start">
        <Brand href="/" className="brand-mini" />
        {roadmapName && (
          <span className="header-roadmap-name">{roadmapName}</span>
        )}
      </div>

      <div className="header-end">
        {!readOnly && (
          <>
            <button className="iconbtn" title="Import / Export" onClick={onIO}>
              <Icon name="export" size={16} />
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
        <ThemeToggle />
        <RoadmapSwitcher />
      </div>
    </header>
  )
}
