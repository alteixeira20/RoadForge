'use client'

import { Icon } from '@/components/ui/Icon'
import { TaskRow } from './TaskRow'
import { useTaskReorder } from '@/hooks/useTaskReorder'
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
  const taskIds = topLevelTasks.map((t) => t.id)

  const isAnyTaskInPhaseExpanded = expandedTaskId !== null && phase.tasks.some(t => t.id === expandedTaskId)

  // ─── Drag & Drop Reordering ──────────────────────────────────────────────

  const handleReorderTasks = (newOrder: string[]) => {
    onReorderTasks(phase.id, newOrder)
  }

  const { dragState, handlePointerDown, handlePointerMove, handlePointerUp } = useTaskReorder({
    taskIds,
    onReorder: handleReorderTasks,
    readOnly,
  })

  const { isDragging, draggedId, visualDropSlot, translateY } = dragState

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
          {isDragging && draggedId !== null && visualDropSlot === 0 && (
            <div className="drop-indicator" />
          )}
          {topLevelTasks.map((t, index) => {
            const isExpanded = expandedTaskId === t.id
            const isBeingDragged = isDragging && draggedId === t.id
            
            const isDropTarget = isDragging && visualDropSlot === index + 1

            return (
              <div key={t.id}>
                <div
                  className={[
                    'draggable-task-wrapper',
                    isBeingDragged ? 'dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={isBeingDragged ? { transform: `translateY(${translateY}px)` } : undefined}
                  onPointerDown={(e) => {
                    if (!isExpanded && !isAnyTaskInPhaseExpanded) handlePointerDown(e, t.id, index)
                  }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <TaskRow
                    task={t}
                    allTasks={allTasks}
                    expanded={isExpanded}
                    expandedTaskId={expandedTaskId}
                    readOnly={readOnly}
                    dragDisabled={isAnyTaskInPhaseExpanded}
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
                {isDropTarget && !isBeingDragged && <div className="drop-indicator" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

