'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'
import { getRoadmapActivity, isApiConnectionError } from '@/services/roadmap.service'
import type { ActivityLog } from '@/types/roadmap'

interface ActivityPanelProps {
  roadmapId: string | null
  sessionToken: string | null
  onClose: () => void
}

export function ActivityPanel({ roadmapId, sessionToken, onClose }: ActivityPanelProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [state, setState] = useState<'local' | 'loading' | 'offline' | 'auth' | 'error' | 'ready'>('loading')
  const isServerBacked = Boolean(roadmapId && sessionToken)

  useEffect(() => {
    async function load() {
      setLogs([])

      if (!roadmapId || !sessionToken) {
        setState('local')
        return
      }

      setState('loading')
      try {
        const data = await getRoadmapActivity(roadmapId, sessionToken)
        setLogs(data.logs)
        setState('ready')
      } catch (err) {
        if (isApiConnectionError(err)) {
          setState('offline')
        } else if (err instanceof Error && (err.message.includes('401') || err.message.includes('403'))) {
          setState('auth')
        } else {
          setState('error')
        }
      }
    }
    load()
  }, [isServerBacked, roadmapId, sessionToken])

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    const hrs = Math.floor(mins / 60)
    const days = Math.floor(hrs / 24)

    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (hrs < 24) return `${hrs}h ago`
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString()
  }

  const getActionLabel = (action: string, metadata: Record<string, unknown> | null) => {
    switch (action) {
      case 'roadmap.created': return 'Created roadmap'
      case 'roadmap.updated': return 'Saved roadmap'
      case 'participant.joined': return `Joined as ${metadata?.role || 'contributor'}`
      case 'share_link.rotated': return `Rotated ${metadata?.role || ''} link`
      case 'share_link.revoked': return `Revoked ${metadata?.role || ''} link`
      default: return action
    }
  }

  const getDetails = (log: ActivityLog) => {
    const { action, before_json, after_json, metadata_json } = log
    if (action === 'roadmap.created' && after_json?.name) {
      return <span>&ldquo;{String(after_json.name)}&rdquo;</span>
    }
    if (action === 'roadmap.updated') {
      if (before_json?.phase_count !== undefined && after_json?.phase_count !== undefined) {
        return <span>{String(after_json.phase_count)} phases</span>
      }
      return <span className="dim">Snapshot saved</span>
    }
    if (action === 'task.completed' || action === 'task.reopened' || action === 'task.created' || action === 'task.updated') {
      return <span>{String(metadata_json?.taskId)} — {String(metadata_json?.taskTitle)}</span>
    }
    if (action === 'task.dependency.linked' || action === 'task.dependency.unlinked') {
      return <span>{String(metadata_json?.taskId)} depends on {String(metadata_json?.dependencyId)}</span>
    }
    if (action === 'task.reordered') {
      if (metadata_json?.phaseId) {
        return <span>Phase {String(metadata_json?.phaseName || metadata_json?.phaseId)}</span>
      }
      return <span>{String(metadata_json?.taskId)} — {String(metadata_json?.taskTitle)}</span>
    }
    return null
  }

  return (
    <div className="activity-panel">
      <div className="panel-head">
        <h3>Activity</h3>
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
            <p>Loading activity...</p>
          </div>
        ) : state === 'local' ? (
          <div className="state-msg">
            <Icon name="activity" size={24} />
            <p>Activity logs become available after saving this roadmap to RoadForge.</p>
            <small>Local changes are still stored in this browser.</small>
          </div>
        ) : state === 'offline' ? (
          <div className="state-msg offline">
            <Icon name="activity" size={24} />
            <p>Activity is unavailable while the RoadForge API is offline. Your cached roadmap is still usable.</p>
          </div>
        ) : state === 'auth' ? (
          <div className="state-msg offline">
            <Icon name="lock" size={24} />
            <p>Activity could not be loaded for this session.</p>
          </div>
        ) : state === 'error' ? (
          <div className="state-msg offline">
            <Icon name="activity" size={24} />
            <p>Activity could not be loaded right now.</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="state-msg">
            <Icon name="activity" size={24} />
            <p>No activity yet.</p>
          </div>
        ) : (
          <div className="activity-list">
            {logs.map((log) => (
              <div key={log.id} className="activity-row">
                <div className="row-main">
                  <span className="actor">{log.actor_name || 'System'}</span>
                  <span className="action">{getActionLabel(log.action, log.metadata_json)}</span>
                </div>
                <div className="row-meta">
                  <span className="details">{getDetails(log)}</span>
                  <span className="time">{formatTime(log.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
