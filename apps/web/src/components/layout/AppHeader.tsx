'use client'

import { TEAM_FEATURES_ENABLED } from '@/config/capabilities'
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
        {!readOnly && (
          <button className="iconbtn" title="Import / Export" aria-label="Import / Export" onClick={onIO}>
            <Icon name="export" size={16} />
          </button>
        )}
        <ProblemReportLink className="btn sm header-report-link" />
        {!readOnly && (
          <>
            {!isServerBacked ? (
              <button
                className="btn sm header-save-btn"
                onClick={onSave}
                title="Back this roadmap with the local RoadForge service"
                aria-label="Save to local service"
              >
                <Icon name="cloud" size={14} />
                <span className="header-save-label">Save to service</span>
              </button>
            ) : syncStatus === 'conflict' ? (
              <button
                className="btn sm header-save-btn"
                onClick={onReloadServerVersion}
                title="Load the server version"
                aria-label="Load the server version"
              >
                <Icon name="cloud" size={14} />
                <span className="header-save-label">Reload</span>
              </button>
            ) : syncStatus === 'offline' || syncStatus === 'error' ? (
              <button
                className="btn sm header-save-btn"
                onClick={onSave}
                title={syncStatus === 'offline' ? 'Retry service save' : 'Review or retry save'}
                aria-label={syncStatus === 'offline' ? 'Retry service save' : 'Review or retry save'}
              >
                <Icon name="cloud" size={14} />
                <span className="header-save-label">
                  {syncStatus === 'offline' ? 'Retry' : 'Review'}
                </span>
              </button>
            ) : TEAM_FEATURES_ENABLED && canManageShare ? (
              <button className="btn sm" onClick={onShare}>
                <Icon name="share" size={14} /> Share
              </button>
            ) : canManageShare ? (
              <button
                className="btn sm"
                type="button"
                disabled
                title="Team sharing is in progress — available soon"
                aria-label="Team sharing in progress — available soon"
              >
                <Icon name="share" size={14} /> Team sharing · Soon
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
