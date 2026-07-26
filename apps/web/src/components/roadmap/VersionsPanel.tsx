'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SidePanel } from '@/components/ui/SidePanel'
import { createRoadmapCheckpoint, getRoadmapVersions, restoreRoadmapVersion } from '@/services/roadmap-crud.service'
import { getConflictMetadata, isAuthError } from '@/services/roadmap-http'
import type { Roadmap, RoadmapVersionSummary } from '@/types/roadmap'

interface VersionsPanelProps {
  roadmapId: string
  sessionToken: string
  // The base revision this restore is checked against (RF-045
  // compare-and-swap contract, same as PUT/PATCH writes).
  currentUpdatedAt: string
  // True when this client has local edits that haven't reached the server
  // yet — restoring would discard them, so the confirmation must say so.
  hasUnsavedChanges: boolean
  onClose: () => void
  onRestored: (roadmap: Roadmap) => void
  onToast: (message: string) => void
  canManageVersions: boolean
}

interface RestoreConflictState {
  version: RoadmapVersionSummary
  serverName: string
  serverUpdatedAt: string
}

function actionLabel(action: string | null): string {
  switch (action) {
    case 'roadmap.created': return 'Created'
    case 'roadmap.imported': return 'Imported'
    case 'import.replaced': return 'Import replaced'
    case 'roadmap.restored': return 'Restored'
    case 'roadmap.checkpoint': return 'Checkpoint'
    case 'roadmap.updated': return 'Updated'
    case 'roadmap.batch_changed': return 'Updated'
    // Legacy task-level snapshots from before version policy was introduced
    case 'task.completed':
    case 'task.reopened':
    case 'task.created':
    case 'task.updated':
    case 'task.reordered':
    case 'task.dependency.linked':
    case 'task.dependency.unlinked':
    case 'phase.completed':
    case 'phase.reopened':
      return 'Legacy snapshot'
    default: return action ? 'Legacy snapshot' : 'Updated'
  }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function VersionsPanel({
  roadmapId,
  sessionToken,
  currentUpdatedAt,
  hasUnsavedChanges,
  onClose,
  onRestored,
  onToast,
  canManageVersions,
}: VersionsPanelProps) {
  const [versions, setVersions] = useState<RoadmapVersionSummary[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<RoadmapVersionSummary | null>(null)
  const [conflict, setConflict] = useState<RestoreConflictState | null>(null)
  const [checkpointLoading, setCheckpointLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState('loading')
    getRoadmapVersions(roadmapId, sessionToken)
      .then((data) => {
        if (cancelled) return
        setVersions(data)
        setState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setState('error')
      })
    return () => { cancelled = true }
  }, [roadmapId, sessionToken, refreshKey])

  const handleCreateCheckpoint = async () => {
    setCheckpointLoading(true)
    try {
      const result = await createRoadmapCheckpoint(roadmapId, sessionToken)
      if (result.created) {
        onToast('Checkpoint created.')
        setRefreshKey((k) => k + 1)
      } else {
        onToast('Latest version already matches current roadmap.')
      }
    } catch (err) {
      const msg = err instanceof Error && (err.message.includes('401') || err.message.includes('403'))
        ? 'Only the owner can create checkpoints.'
        : 'Could not create checkpoint.'
      onToast(msg)
    } finally {
      setCheckpointLoading(false)
    }
  }

  const handleRestoreRequest = (version: RoadmapVersionSummary) => {
    setPendingRestoreVersion(version)
  }

  // Shared restore attempt for both the normal confirm path and the
  // owner-only force path. A 409 never surfaces as a generic failure toast —
  // it opens the conflict confirmation instead, carrying the fresh server
  // revision the caller must use to force through it.
  const attemptRestore = async (
    version: RoadmapVersionSummary,
    baseUpdatedAt: string,
    force: boolean,
  ) => {
    setRestoringId(version.id)
    try {
      const restored = await restoreRoadmapVersion(roadmapId, version.id, sessionToken, baseUpdatedAt, force)
      onRestored(restored)
      onToast(force ? 'Restored roadmap, overwriting the newer revision.' : 'Restored roadmap')
      setPendingRestoreVersion(null)
      setConflict(null)
      onClose()
    } catch (err) {
      const conflictMetadata = getConflictMetadata(err)
      if (conflictMetadata) {
        setPendingRestoreVersion(null)
        setConflict({
          version,
          serverName: conflictMetadata.server.name,
          serverUpdatedAt: conflictMetadata.server_updated_at,
        })
        return
      }
      const msg = isAuthError(err)
        ? 'Only the owner can restore versions.'
        : `Could not restore this version: ${err instanceof Error ? err.message : 'unknown error'}.`
      onToast(msg)
      setPendingRestoreVersion(null)
    } finally {
      setRestoringId(null)
    }
  }

  const handleRestoreConfirm = () => {
    if (!pendingRestoreVersion) return
    void attemptRestore(pendingRestoreVersion, currentUpdatedAt, false)
  }

  const handleRestoreCancel = () => {
    setPendingRestoreVersion(null)
  }

  const handleForceRestore = () => {
    if (!conflict) return
    void attemptRestore(conflict.version, conflict.serverUpdatedAt, true)
  }

  const handleDismissConflict = () => {
    setConflict(null)
  }

  const restoreMessage = hasUnsavedChanges
    ? 'Restore this version? You have unsaved local changes that will be lost, and the current roadmap will be replaced for all collaborators.'
    : 'Restore this version? The current roadmap will be replaced for all collaborators.'

  return (
    <>
    <ConfirmDialog
      open={canManageVersions && pendingRestoreVersion !== null}
      title="Restore version"
      message={restoreMessage}
      confirmLabel="Restore version"
      tone="danger"
      loading={restoringId !== null}
      onConfirm={handleRestoreConfirm}
      onClose={handleRestoreCancel}
    />
    <ConfirmDialog
      open={canManageVersions && conflict !== null}
      title="Someone else changed this roadmap"
      message={
        conflict
          ? `The roadmap was updated to "${conflict.serverName}" after you opened Versions. Force restoring will replace that newer state — it will be saved as a recovery checkpoint first, so it can be brought back.`
          : ''
      }
      confirmLabel="Force restore anyway"
      cancelLabel="Keep reviewing"
      tone="danger"
      loading={restoringId !== null}
      onConfirm={handleForceRestore}
      onClose={handleDismissConflict}
    />
    <SidePanel
      title="Versions"
      className="versions-panel"
      onClose={onClose}
      headerActions={canManageVersions ? (
          <div className="panel-head-actions">
            <button
              className="btn sm ghost"
              onClick={handleCreateCheckpoint}
              disabled={checkpointLoading}
              title="Save a restore point with the current roadmap state"
            >
              {checkpointLoading ? 'Saving…' : 'Create checkpoint'}
            </button>
          </div>
      ) : undefined}
    >
      <div className="panel-body">
        {!canManageVersions && (
          <div className="state-msg">
            <Icon name="lock" size={18} />
            <p>Version history is read-only for editors.</p>
            <small>Only the owner can create checkpoints or restore a version.</small>
          </div>
        )}
        {state === 'loading' ? (
          <div className="state-msg">
            <span className="spin">
              <Icon name="spark" size={24} />
            </span>
            <p>Loading versions...</p>
          </div>
        ) : state === 'error' ? (
          <div className="state-msg offline">
            <Icon name="clock" size={24} />
            <p>Versions could not be loaded.</p>
          </div>
        ) : versions.length === 0 ? (
          <div className="state-msg">
            <Icon name="clock" size={24} />
            <p>No versions yet.</p>
          </div>
        ) : (
          <div className="version-list">
            {versions.map((version) => (
              <div key={version.id} className="version-row">
                <div className="version-main">
                  <div className="version-title">
                    <span>v{version.versionNumber}</span>
                    {actionLabel(version.action)}
                  </div>
                  <div className="version-meta">
                    {formatTime(version.createdAt)} · {version.actorName || 'System'}
                  </div>
                  <div className="version-counts">
                    {version.phaseCount} phases · {version.taskCount} tasks
                  </div>
                </div>
                {canManageVersions && (
                  <button
                    className="btn sm ghost"
                    onClick={() => handleRestoreRequest(version)}
                    disabled={restoringId === version.id}
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SidePanel>
    </>
  )
}
