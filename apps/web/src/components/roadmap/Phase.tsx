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
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  onReorderTasks: (phaseId: string, taskIds: string[]) => void
  onReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
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
  onUpdateTask,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  onReorderTasks,
  onReorderSubtasks,
  hasCycle,
  allTasks,
  readOnly,
}: PhaseProps) {
  const doneCount = phase.tasks.filter((t) => t.done).length
  const allDone = doneCount === phase.tasks.length && phase.tasks.length > 0
  const isActive = phase.status === 'active'

  // Rule: Phase only shows 'Complete' if all tasks are done
  const displayStatus = allDone ? 'done' : (phase.status === 'done' ? 'active' : phase.status)

  const headStyle: ForgeStyle = { '--phase-color': phase.color }
  const progressStyle: ForgeStyle = { '--p': `${phase.progress}%` }

  // Only render top-level tasks in the main phase list
  const topLevelTasks = phase.tasks.filter((t) => !t.parentId)

  // ─── Drag & Drop Reordering ──────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    if (readOnly) return
    e.dataTransfer.setData('taskId', taskId)
    e.dataTransfer.setData('phaseId', phase.id)
    e.dataTransfer.effectAllowed = 'move'
    
    // Add a class for styling
    const el = e.currentTarget as HTMLElement
    el.classList.add('dragging')
  }

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement
    el.classList.remove('dragging')
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    
    const el = e.currentTarget as HTMLElement
    el.classList.add('drag-over')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement
    el.classList.remove('drag-over')
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    if (readOnly) return
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.classList.remove('drag-over')

    const draggedId = e.dataTransfer.getData('taskId')
    const sourcePhaseId = e.dataTransfer.getData('phaseId')

    if (sourcePhaseId !== phase.id) return // No cross-phase dragging yet
    if (draggedId === targetId) return

    const taskIds = topLevelTasks.map(t => t.id)
    const oldIdx = taskIds.indexOf(draggedId)
    const newIdx = taskIds.indexOf(targetId)

    if (oldIdx === -1 || newIdx === -1) return

    const newOrder = [...taskIds]
    newOrder.splice(oldIdx, 1)
    newOrder.splice(newIdx, 0, draggedId)

    onReorderTasks(phase.id, newOrder)
  }

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
          {phaseStatusLabel(displayStatus)}
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
          {topLevelTasks.map((t) => (
            <div
              key={t.id}
              draggable={!readOnly}
              onDragStart={(e) => handleDragStart(e, t.id)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, t.id)}
              className="draggable-task-wrapper"
            >
              <TaskRow
                task={t}
                allTasks={allTasks}
                expanded={expandedTaskId === t.id}
                expandedTaskId={expandedTaskId}
                readOnly={readOnly}
                onToggle={onToggleTask}
                onCheck={onCheckTask}
                onUpdateTask={onUpdateTask}
                onAddSubtask={onAddSubtask}
                onLinkDependency={onLinkDependency}
                onUnlinkDependency={onUnlinkDependency}
                onReorderSubtasks={onReorderSubtasks}
                hasCycle={hasCycle}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

