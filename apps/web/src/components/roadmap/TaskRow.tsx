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
  expandedTaskId: string | null
  readOnly: boolean
  onToggle: (id: string) => void
  onCheck: (id: string) => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  onReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
  hasCycle: (taskId: string, depId: string) => boolean
  isNested?: boolean
}

const TAG_COLORS: Record<string, string> = {
  infra: '#7c3aed', // violet
  design: '#db2777', // pink
  security: '#dc2626', // red
  backend: '#2563eb', // blue
  frontend: '#0891b2', // cyan
  polish: '#ca8a04', // yellow
  subtask: '#4b5563', // gray
}

function getTagColor(tag: string): string {
  const normalized = tag.toLowerCase().trim()
  if (TAG_COLORS[normalized]) return TAG_COLORS[normalized]

  // Deterministic color from a small palette
  const palette = [
    '#059669', // emerald
    '#d97706', // amber
    '#4f46e5', // indigo
    '#9333ea', // purple
    '#c026d3', // fuchsia
    '#e11d48', // rose
  ]
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash)
  }
  return palette[Math.abs(hash) % palette.length]
}

export function TaskRow({
  task,
  allTasks,
  expanded,
  expandedTaskId,
  readOnly,
  onToggle,
  onCheck,
  onUpdateTask,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  onReorderSubtasks,
  hasCycle,
  isNested = false,
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
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Partial<Task>>({})

  const target = `task:${task.id}`
  const lock = locks[target]
  const isLockedByMe = lock?.participantId === participantId
  const isLockedByOther = lock && !isLockedByMe
  const effectivelyReadOnly = readOnly || isLockedByOther

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!expanded) {
      setShowSubtaskForm(false)
      setShowDepPicker(false)
      setIsEditing(false)
    }
  }, [expanded])

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleStartEdit = () => {
    setEditDraft({
      title: task.title,
      est: task.est,
      desc: task.desc,
      tags: [...(task.tags || [])],
    })
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    onUpdateTask(task.id, {
      ...editDraft,
      title: editDraft.title?.trim(),
      tags: (editDraft.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    })
    setIsEditing(false)
  }

  const navigateToTask = (id: string) => {
    const el = document.getElementById(`task-${id}`)
    if (el) {
      onToggle(id)
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('highlight-flash')
      setTimeout(() => el.classList.remove('highlight-flash'), 2000)
    }
  }

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

  const subtasks = allTasks.filter((t) => t.parentId === task.id)

  const checkStyle: CSSProperties = effectivelyReadOnly
    ? { cursor: 'not-allowed', opacity: 0.6 }
    : {}

  // ─── Subtask Reordering ──────────────────────────────────────────────────

  const handleSubtaskDragStart = (e: React.DragEvent, sid: string) => {
    if (readOnly) return
    e.stopPropagation()
    e.dataTransfer.setData('subtaskId', sid)
    e.dataTransfer.setData('parentId', task.id)
    e.dataTransfer.effectAllowed = 'move'
    
    const el = e.currentTarget as HTMLElement
    el.classList.add('dragging')
  }

  const handleSubtaskDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement
    el.classList.remove('dragging')
  }

  const handleSubtaskDragOver = (e: React.DragEvent) => {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    
    const el = e.currentTarget as HTMLElement
    el.classList.add('drag-over')
  }

  const handleSubtaskDragLeave = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement
    el.classList.remove('drag-over')
  }

  const handleSubtaskDrop = (e: React.DragEvent, targetId: string) => {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    
    const el = e.currentTarget as HTMLElement
    el.classList.remove('drag-over')

    const draggedId = e.dataTransfer.getData('subtaskId')
    const sourceParentId = e.dataTransfer.getData('parentId')

    if (sourceParentId !== task.id) return
    if (draggedId === targetId) return

    const sids = subtasks.map(s => s.id)
    const oldIdx = sids.indexOf(draggedId)
    const newIdx = sids.indexOf(targetId)

    if (oldIdx === -1 || newIdx === -1) return

    const newOrder = [...sids]
    newOrder.splice(oldIdx, 1)
    newOrder.splice(newIdx, 0, draggedId)

    onReorderSubtasks(task.id, newOrder)
  }

  return (
    <div
      id={`task-${task.id}`}
      className={[
        'task',
        expanded ? 'expanded' : '',
        task.done ? 'done' : '',
        task.next ? 'next' : '',
        isLockedByOther ? 'locked' : '',
        isNested ? 'nested' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="task-row">
        {!effectivelyReadOnly && !expanded && (
          <div className="drag-handle" title="Drag to reorder">
            <Icon name="grip" size={14} />
          </div>
        )}
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
        {task.est && blockedBy.length === 0 && !isNested && (
          <span className="meta-pill">{task.est}</span>
        )}
        <span className="id">{task.id}</span>
        <button
          type="button"
          className="toggle-btn"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(task.id)
          }}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse task' : 'Expand task'}
        >
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
        </button>
      </div>

      {expanded && (
        <div className="task-detail" onClick={(e) => e.stopPropagation()}>
          {isEditing ? (
            <div className="edit-form">
              <div className="field">
                <label>Title</label>
                <input
                  autoFocus
                  value={editDraft.title || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                  placeholder="Task title..."
                />
              </div>
              {!isNested && (
                <div className="field">
                  <label>Estimate</label>
                  <input
                    value={editDraft.est || ''}
                    onChange={(e) => setEditDraft({ ...editDraft, est: e.target.value })}
                    placeholder="e.g. 2d, 5h..."
                  />
                </div>
              )}
              <div className="field full">
                <label>Description</label>
                <textarea
                  value={editDraft.desc || ''}
                  onChange={(e) => setEditDraft({ ...editDraft, desc: e.target.value })}
                  placeholder="Task details..."
                  rows={3}
                />
              </div>
              <div className="field full">
                <label>Tags (comma separated)</label>
                <input
                  value={(editDraft.tags || []).join(', ')}
                  onChange={(e) => setEditDraft({ ...editDraft, tags: e.target.value.split(',') })}
                  placeholder="infra, design..."
                />
              </div>
              <div className="edit-actions">
                <button className="btn sm ghost" onClick={() => setIsEditing(false)}>Discard</button>
                <button className="btn sm primary" onClick={handleSaveEdit}>Save</button>
              </div>
            </div>
          ) : (
            <>
              {task.desc && <div className="desc">{task.desc}</div>}

              <div className="grid">
                {!isNested && (
                  <>
                    <div className="label">Estimate</div>
                    <div className="value">{task.est ?? '—'}</div>
                  </>
                )}
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
                    <div className="value tags">
                      {(task.tags ?? []).map((g) => (
                        <span key={g} className="tag-pill" style={{ '--tag-bg': getTagColor(g) } as CSSProperties}>
                          {g}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {depTasks.length > 0 && (
                <div className="section">
                  <div className="section-label">Depends on</div>
                  <div className="deps">
                    {depTasks.map((d) => (
                      <div key={d.id} className="dep-row" onClick={() => navigateToTask(d.id)}>
                        <Icon
                          name={d.done ? 'circle-check' : 'circle'}
                          size={14}
                          stroke={d.done ? 'var(--ink-3)' : 'var(--ember)'}
                        />
                        <span className="title">{d.title}</span>
                        <span className="did">{d.id}</span>
                        <span className={`dst ${d.done ? 'done' : 'ready'}`}>
                          {d.done ? 'done' : 'ready'}
                        </span>
                        {!effectivelyReadOnly && (
                          <button
                            className="btn-remove"
                            onClick={(e) => {
                              e.stopPropagation()
                              onUnlinkDependency(task.id, d.id)
                            }}
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

              {subtasks.length > 0 && (
                <div className="section">
                  <div className="section-label">Subtasks</div>
                  <div className="subtasks">
                    {subtasks.map((st) => {
                      const isStExpanded = expandedTaskId === st.id
                      return (
                        <div
                          key={st.id}
                          draggable={!readOnly && !isStExpanded}
                          onDragStart={(e) => {
                            const target = e.target as HTMLElement
                            if (!target.closest('.drag-handle')) {
                              e.preventDefault()
                              return
                            }
                            handleSubtaskDragStart(e, st.id)
                          }}
                          onDragEnd={handleSubtaskDragEnd}
                          onDragOver={handleSubtaskDragOver}
                          onDragLeave={handleSubtaskDragLeave}
                          onDrop={(e) => handleSubtaskDrop(e, st.id)}
                          className="draggable-task-wrapper"
                        >
                          <TaskRow
                            task={st}
                            allTasks={allTasks}
                            expanded={isStExpanded}
                            expandedTaskId={expandedTaskId}
                            readOnly={readOnly}
                            onToggle={onToggle}
                            onCheck={onCheck}
                            onUpdateTask={onUpdateTask}
                            onAddSubtask={onAddSubtask}
                            onLinkDependency={onLinkDependency}
                            onUnlinkDependency={onUnlinkDependency}
                            onReorderSubtasks={onReorderSubtasks}
                            hasCycle={hasCycle}
                            isNested
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!effectivelyReadOnly && (
                <div className="task-actions-footer">
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
                      {!isNested && (
                        <button className="btn sm" onClick={() => setShowSubtaskForm(true)}>
                          <Icon name="plus" size={13} /> Add subtask
                        </button>
                      )}
                      {!isNested && (
                        <button className="btn sm" onClick={() => setShowDepPicker(true)}>
                          <Icon name="link" size={13} /> Link dependency
                        </button>
                      )}
                      <span className="spacer" />
                      <button className="iconbtn" onClick={handleStartEdit} title="Edit task">
                        <Icon name="pencil" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
