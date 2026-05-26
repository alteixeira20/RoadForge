'use client'

import { Icon } from '@/components/ui/Icon'

interface WorkspaceBannersProps {
  readOnly: boolean
  roadmapName: string
  ownerDisplayName: string | null
  isConflict: boolean
  onCreateOwn?: () => void
  onReloadServerVersion: () => void
}

export function WorkspaceBanners({
  readOnly,
  roadmapName,
  ownerDisplayName,
  isConflict,
  onCreateOwn,
  onReloadServerVersion,
}: WorkspaceBannersProps) {
  return (
    <>
      {readOnly && (
        <div className="readonly-banner">
          <span className="pill">
            <Icon name="circle" size={11} /> Viewer
          </span>
          <span className="who">
            You&apos;re viewing <b>{roadmapName}</b> as a read-only guest.
            {ownerDisplayName && <> Owner: <b>{ownerDisplayName}</b>.</>}
          </span>
          <span className="spacer" />
          <button className="btn sm" onClick={onCreateOwn}>
            <Icon name="plus" size={13} /> Create your own roadmap
          </button>
        </div>
      )}

      {isConflict && !readOnly && (
        <div className="conflict-banner">
          <span className="pill">
            <Icon name="shield" size={11} /> Conflict
          </span>
          <span className="msg">
            The roadmap changed elsewhere. Your edits are preserved locally.
          </span>
          <span className="spacer" />
          <button className="btn sm" onClick={onReloadServerVersion}>
            <Icon name="cloud" size={13} /> Reload server version
          </button>
        </div>
      )}
    </>
  )
}

interface WorkspaceUpgradeNoticeProps {
  roadmapUpgradeNotice: unknown
  onDismissUpgradeNotice: () => void
}

export function WorkspaceUpgradeNotice({
  roadmapUpgradeNotice,
  onDismissUpgradeNotice,
}: WorkspaceUpgradeNoticeProps) {
  if (!roadmapUpgradeNotice) return null
  return (
    <div className="upgrade-notice" role="status">
      <div className="upgrade-notice-icon">
        <Icon name="shield" size={16} />
      </div>
      <div className="upgrade-notice-copy">
        <strong>Roadmap updated</strong>
        <span>RoadForge updated this roadmap so it works with the latest version. No action is required.</span>
      </div>
      <div className="upgrade-notice-actions">
        <button type="button" className="iconbtn" aria-label="Dismiss schema upgrade notice" onClick={onDismissUpgradeNotice}>
          <Icon name="x" size={15} />
        </button>
      </div>
    </div>
  )
}
