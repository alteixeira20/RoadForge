'use client'

import { Icon } from '@/components/ui/Icon'
import { TaskRow } from './TaskRow'
import type { Phase as PhaseType, Task } from '@/types/roadmap'
import type { ForgeStyle } from '@/types/ui'

interface PhaseProps {
  phase: PhaseType
  isOpen: boolean
  onToggle: (id: string) => void
  expandedTaskId: string | null
  onToggleTask: (id: string) => void
  onCheckTask: (id: string) => void
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  hasCycle: (taskId: string, depId: string) => boolean
  allTasks: Task[]
  readOnly: boolean
}

function phaseStatusLabel(status: PhaseType['status']): string {
  switch (status) {
    case 'done':   return 'Complete'
    case 'active': return 'In progress'
    case 'next':   return 'Up next'
    default:       return 'Future'
  }
}

export function Phase({
  phase,
  isOpen,
  onToggle,
  expandedTaskId,
  onToggleTask,
  onCheckTask,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  hasCycle,
  allTasks,
  readOnly,
}: PhaseProps) {
  const doneCount = phase.tasks.filter((t) => t.done).length
  const isActive = phase.status === 'active'

  const headStyle: ForgeStyle = { '--phase-color': phase.color }
  const progressStyle: ForgeStyle = { '--p': `${phase.progress}%` }

  return (
    <div
      className={[
        'phase',
        isOpen ? 'expanded' : '',
        isActive ? 'active-phase' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={headStyle}
    >
      <div className="phase-head" onClick={() => onToggle(phase.id)}>
        <span className="chev">
          <Icon name="chevron-right" size={16} />
        </span>
        <span className="num">{phase.num}</span>
        <span className="name">{phase.name}</span>
        <span className={`status ${isActive ? 'active' : ''}`}>
          {phaseStatusLabel(phase.status)}
        </span>
        <span className="progress-mini" style={progressStyle}>
          <i />
        </span>
        <span className="count">
          {doneCount}/{phase.tasks.length}
        </span>
      </div>

      {isOpen && (
        <div className="phase-body">
          {phase.tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              allTasks={allTasks}
              expanded={expandedTaskId === t.id}
              readOnly={readOnly}
              onToggle={onToggleTask}
              onCheck={onCheckTask}
              onAddSubtask={onAddSubtask}
              onLinkDependency={onLinkDependency}
              onUnlinkDependency={onUnlinkDependency}
              hasCycle={hasCycle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

