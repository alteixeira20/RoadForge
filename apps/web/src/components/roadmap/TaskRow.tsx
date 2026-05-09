'use client'

import type { CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useRoadmap } from '@/context/RoadmapContext'
import type { Task } from '@/types/roadmap'

interface TaskRowProps {
  task: Task
  allTasks: Task[]
  expanded: boolean
  readOnly: boolean
  onToggle: (id: string) => void
  onCheck: (id: string) => void
}

export function TaskRow({ task, allTasks, expanded, readOnly, onToggle, onCheck }: TaskRowProps) {
  const { displayName } = useRoadmap()
  const ownerInitials = displayName
    ? displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
    : '?'
  const ownerLabel = displayName || 'You'

  const depTasks = (task.deps ?? [])
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined)

  const blockedBy = depTasks.filter((d) => !d.done)

  const checkStyle: CSSProperties = readOnly
    ? { cursor: 'not-allowed', opacity: 0.6 }
    : {}

  return (
    <div
      className={[
        'task',
        expanded ? 'expanded' : '',
        task.done ? 'done' : '',
        task.next ? 'next' : '',
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
            if (!readOnly) onCheck(task.id)
          }}
        />
        <div className="title">{task.title}</div>
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {!readOnly && (
            <div className="actions">
              <button className="btn sm">
                <Icon name="plus" size={13} /> Add subtask
              </button>
              <button className="btn sm">
                <Icon name="link" size={13} /> Link dependency
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
