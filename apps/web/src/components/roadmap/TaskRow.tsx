'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useRoadmap } from '@/context/RoadmapContext'
import { acquireLock, releaseLock } from '@/services/roadmap.service'
import { SubtaskForm, DependencyPicker } from './TaskActionForms'
import type { Task } from '@/types/roadmap'

interface TaskRowProps {
  task: Task
  allTasks: Task[]
  expanded: boolean
  readOnly: boolean
  onToggle: (id: string) => void
  onCheck: (id: string) => void
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  hasCycle: (taskId: string, depId: string) => boolean
}

export function TaskRow({
  task,
  allTasks,
  expanded,
  readOnly,
  onToggle,
  onCheck,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  hasCycle,
}: TaskRowProps) {
  const {
    displayName,
    locks,
    serverRoadmapId,
    sessionToken,
    participantId,
  } = useRoadmap()

  const [showSubtaskForm, setShowSubtaskForm] = useState(false)
  const [showDepPicker, setShowDepPicker] = useState(false)

  const target = `task:${task.id}`
  const lock = locks[target]
  const isLockedByMe = lock?.participantId === participantId
  const isLockedByOther = lock && !isLockedByMe
  const effectivelyReadOnly = readOnly || isLockedByOther

  // ─── Reset local state when collapsed ───────────────────────────────────────

  useEffect(() => {
    if (!expanded) {
      setShowSubtaskForm(false)
      setShowDepPicker(false)
    }
  }, [expanded])

  // ─── Lock lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!expanded || readOnly || !serverRoadmapId || !sessionToken) return

    let interval: ReturnType<typeof setInterval> | null = null

    const tryAcquire = async () => {
      try {
        await acquireLock(serverRoadmapId, target, sessionToken)
      } catch (err) {
        console.error('Failed to acquire lock', err)
      }
    }

    tryAcquire()
    // Refresh lock every 20s (TTL is 30s)
    interval = setInterval(tryAcquire, 20_000)

    return () => {
      if (interval) clearInterval(interval)
      releaseLock(serverRoadmapId, target, sessionToken).catch(() => {
        // Silently fail on release (TTL will handle it)
      })
    }
  }, [expanded, readOnly, serverRoadmapId, sessionToken, target])

  // ─── Rendering ───────────────────────────────────────────────────────────────

  const ownerInitials = displayName
    ? displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
    : '?'
  const ownerLabel = displayName || 'You'

  const depTasks = (task.deps ?? [])
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined)

  const blockedBy = depTasks.filter((d) => !d.done)

  const checkStyle: CSSProperties = effectivelyReadOnly
    ? { cursor: 'not-allowed', opacity: 0.6 }
    : {}

  return (
    <div
      className={[
        'task',
        expanded ? 'expanded' : '',
        task.done ? 'done' : '',
        task.next ? 'next' : '',
        isLockedByOther ? 'locked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.check')) return
        onToggle(task.id)
      }}
    >
      <div className="task-row">
        <div
          className="check"
          style={checkStyle}
          onClick={(e) => {
            e.stopPropagation()
            if (!effectivelyReadOnly) onCheck(task.id)
          }}
        />
        <div className="title">{task.title}</div>
        {isLockedByOther && (
          <span className="meta-pill" style={{ color: 'var(--ink-3)', background: 'var(--ink-6)' }}>
            <Icon name="shield" size={11} /> {lock.displayName} is editing
          </span>
        )}
        {task.next && !task.done && <span className="next-pip">Next</span>}
        {blockedBy.length > 0 && (
          <span className="meta-pill blocked">⊘ Blocked</span>
        )}
        {task.est && blockedBy.length === 0 && (
          <span className="meta-pill">{task.est}</span>
        )}
        <span className="id">{task.id}</span>
      </div>

      {expanded && (
        <div className="task-detail" onClick={(e) => e.stopPropagation()}>
          {task.desc && <div className="desc">{task.desc}</div>}

          <div className="grid">
            <div className="label">Estimate</div>
            <div className="value">{task.est ?? '—'}</div>
            <div className="label">Owner</div>
            <div className="value" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="avatar" style={{ width: 20, height: 20, fontSize: 10 }}>
                {ownerInitials}
              </span>{' '}
              {ownerLabel}
            </div>
            {(task.tags ?? []).length > 0 && (
              <>
                <div className="label">Tags</div>
                <div className="value">
                  {(task.tags ?? []).map((g) => `#${g}`).join('  ')}
                </div>
              </>
            )}
          </div>

          {depTasks.length > 0 && (
            <div>
              <div className="label" style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 8 }}>
                Depends on
              </div>
              <div className="deps">
                {depTasks.map((d) => (
                  <div key={d.id} className="dep-row">
                    <Icon
                      name={d.done ? 'circle-check' : 'circle'}
                      size={14}
                      stroke={d.done ? 'var(--ink-3)' : 'var(--ember)'}
                    />
                    <span>{d.title}</span>
                    <span className="did">{d.id}</span>
                    <span className={`dst ${d.done ? 'done' : 'ready'}`}>
                      {d.done ? 'done' : 'ready'}
                    </span>
                    {!effectivelyReadOnly && (
                      <button
                        className="btn-remove"
                        onClick={() => onUnlinkDependency(task.id, d.id)}
                        title="Unlink dependency"
                      >
                        <Icon name="x" size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!effectivelyReadOnly && (
            <>
              {showSubtaskForm ? (
                <SubtaskForm
                  onAdd={(title) => {
                    onAddSubtask(task.id, title)
                    setShowSubtaskForm(false)
                  }}
                  onCancel={() => setShowSubtaskForm(false)}
                />
              ) : showDepPicker ? (
                <DependencyPicker
                  currentTask={task}
                  allTasks={allTasks}
                  hasCycle={hasCycle}
                  onLink={(depId) => {
                    onLinkDependency(task.id, depId)
                    setShowDepPicker(false)
                  }}
                  onCancel={() => setShowDepPicker(false)}
                />
              ) : (
                <div className="actions">
                  <button className="btn sm" onClick={() => setShowSubtaskForm(true)}>
                    <Icon name="plus" size={13} /> Add subtask
                  </button>
                  <button className="btn sm" onClick={() => setShowDepPicker(true)}>
                    <Icon name="link" size={13} /> Link dependency
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

