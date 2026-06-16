'use client'

import { Icon } from '@/components/ui/Icon'

interface WorkspaceBannersProps {
  readOnly: boolean
  roadmapName: string
  ownerDisplayName: string | null
  isConflict: boolean
  sessionExpired: boolean
  onDismissSessionExpired: () => void
  onCreateOwn?: () => void
  onReviewConflict?: () => void
  onReloadServerVersion: () => void
}

export function WorkspaceBanners({
  readOnly,
  roadmapName,
  ownerDisplayName,
  isConflict,
  sessionExpired,
  onDismissSessionExpired,
  onCreateOwn,
  onReviewConflict,
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
          {onReviewConflict && (
            <button className="btn sm primary" onClick={onReviewConflict}>
              <Icon name="eye" size={13} /> Review conflict
            </button>
          )}
          <button className="btn sm" onClick={onReloadServerVersion}>
            <Icon name="cloud" size={13} /> Reload server version
          </button>
        </div>
      )}

      {sessionExpired && (
        <div className="conflict-banner">
          <span className="pill">
            <Icon name="shield" size={11} /> Session expired
          </span>
          <span className="msg">
            Your local copy is preserved. Rejoin through an active invite link to sync again.
          </span>
          <span className="spacer" />
          <button className="btn sm" onClick={onDismissSessionExpired}>
            <Icon name="x" size={13} /> Dismiss
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
        <span>Anvilary updated this roadmap so it works with the latest version. No action is required.</span>
      </div>
      <div className="upgrade-notice-actions">
        <button type="button" className="iconbtn" aria-label="Dismiss schema upgrade notice" onClick={onDismissUpgradeNotice}>
          <Icon name="x" size={15} />
        </button>
      </div>
    </div>
  )
}
