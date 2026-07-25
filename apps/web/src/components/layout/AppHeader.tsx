'use client'

import { Icon } from '@/components/ui/Icon'
import { Brand } from '@/components/ui/Brand'
import { ProblemReportLink } from '@/components/ui/ProblemReportLink'
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
        <Brand href="/#hero" className="brand-mini" />
        {roadmapName && (
          <span className="header-roadmap-name">{roadmapName}</span>
        )}
      </div>

      <div className="header-end">
        {/* The Help action is hidden from the workspace header pending
            refinement. /help stays routable and linked from the site header. */}
        <ProblemReportLink className="btn sm header-report-link" />
        {!readOnly && (
          <>
            <button className="iconbtn" title="Import / Export" aria-label="Import / Export" onClick={onIO}>
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
            ) : syncStatus === 'offline' || syncStatus === 'error' ? (
              <button
                className="btn sm header-save-btn"
                onClick={onSave}
                title={syncStatus === 'offline' ? 'Retry sync' : 'Review or retry save'}
                aria-label={syncStatus === 'offline' ? 'Retry sync' : 'Review or retry save'}
              >
                <Icon name="cloud" size={14} />
                <span className="header-save-label">
                  {syncStatus === 'offline' ? 'Retry' : 'Review'}
                </span>
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
        <RoadmapSwitcher />
      </div>
    </header>
  )
}
