'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { createRoadmapCheckpoint, getRoadmapVersions, restoreRoadmapVersion } from '@/services/roadmap.service'
import type { Roadmap, RoadmapVersionSummary } from '@/types/roadmap'

interface VersionsPanelProps {
  roadmapId: string
  sessionToken: string
  onClose: () => void
  onRestored: (roadmap: Roadmap) => void
  onToast: (message: string) => void
}

function actionLabel(action: string | null): string {
  switch (action) {
    case 'roadmap.created': return 'Created'
    case 'roadmap.imported': return 'Imported'
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
  onClose,
  onRestored,
  onToast,
}: VersionsPanelProps) {
  const [versions, setVersions] = useState<RoadmapVersionSummary[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState<RoadmapVersionSummary | null>(null)
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

  const handleRestoreConfirm = async () => {
    if (!pendingRestoreVersion) return
    const version = pendingRestoreVersion
    setRestoringId(version.id)
    try {
      const restored = await restoreRoadmapVersion(roadmapId, version.id, sessionToken)
      onRestored(restored)
      onToast('Restored roadmap')
      setPendingRestoreVersion(null)
      onClose()
    } catch (err) {
      const msg = err instanceof Error && (err.message.includes('401') || err.message.includes('403'))
        ? 'Only the owner can restore versions.'
        : 'Could not restore version'
      onToast(msg)
      setPendingRestoreVersion(null)
    } finally {
      setRestoringId(null)
    }
  }

  const handleRestoreCancel = () => {
    setPendingRestoreVersion(null)
  }

  return (
    <>
    <ConfirmDialog
      open={pendingRestoreVersion !== null}
      title="Restore version"
      message="Restore this version? The current roadmap will be replaced for all collaborators."
      confirmLabel="Restore version"
      tone="danger"
      loading={restoringId !== null}
      onConfirm={handleRestoreConfirm}
      onClose={handleRestoreCancel}
    />
    <div className="slide-panel versions-panel">
      <div className="panel-head">
        <h3>Versions</h3>
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
        <button className="close-btn" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="panel-body">
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
                <button
                  className="btn sm ghost"
                  onClick={() => handleRestoreRequest(version)}
                  disabled={restoringId === version.id}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
