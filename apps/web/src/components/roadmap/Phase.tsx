'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'

import { Icon } from '@/components/ui/Icon'
import { SortableTaskItem } from './SortableTaskItem'
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
  onAddTask: (phaseId: string) => void
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
  onAddTask,
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

  const displayStatus = allDone ? 'done' : (phase.status === 'done' ? 'active' : phase.status)

  const headStyle: ForgeStyle = { '--phase-color': phase.color }
  const progressStyle: ForgeStyle = { '--p': `${phase.progress}%` }

  const topLevelTasks = phase.tasks.filter((t) => !t.parentId)
  const taskIds = topLevelTasks.map((t) => t.id)

  const isAnyTaskInPhaseExpanded = expandedTaskId !== null && phase.tasks.some(t => t.id === expandedTaskId)

  // ─── dnd-kit Setup ────────────────────────────────────────────────────────

  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      const oldIndex = taskIds.indexOf(active.id as string)
      const newIndex = taskIds.indexOf(over.id as string)
      const newOrder = arrayMove(taskIds, oldIndex, newIndex)
      onReorderTasks(phase.id, newOrder)
    }
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  const activeTask = activeId ? topLevelTasks.find((t) => t.id === activeId) : null

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
          {topLevelTasks.length === 0 ? (
            <div className="empty-phase">
              <p>No tasks yet.</p>
              {!readOnly && (
                <button className="btn sm ghost" onClick={() => onAddTask(phase.id)}>
                  <Icon name="plus" size={13} /> Add first task
                </button>
              )}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            >
              <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                <div className="sortable-list">
                  {topLevelTasks.map((t) => (
                    <SortableTaskItem
                      key={t.id}
                      task={t}
                      allTasks={allTasks}
                      expanded={expandedTaskId === t.id}
                      expandedTaskId={expandedTaskId}
                      readOnly={readOnly}
                      dragDisabled={isAnyTaskInPhaseExpanded}
                      onToggle={onToggleTask}
                      onCheck={onCheckTask}
                      onUpdateTask={onUpdateTask}
                      onAddTask={onAddTask}
                      onAddSubtask={onAddSubtask}
                      onLinkDependency={onLinkDependency}
                      onUnlinkDependency={onUnlinkDependency}
                      onReorderSubtasks={onReorderSubtasks}
                      hasCycle={hasCycle}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay 
                dropAnimation={{ 
                  duration: 110,
                  easing: 'cubic-bezier(0.2, 0, 0, 1)',
                  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) 
                }}
              >
                {activeTask ? (
                  <div className="sortable-dragging-overlay">
                    <TaskRow
                      task={activeTask}
                      allTasks={allTasks}
                      expanded={false}
                      expandedTaskId={null}
                      readOnly={true}
                      dragDisabled={false}
                      onToggle={() => {}}
                      onCheck={() => {}}
                      onUpdateTask={() => {}}
                      onAddTask={() => {}}
                      onAddSubtask={() => {}}
                      onLinkDependency={() => {}}
                      onUnlinkDependency={() => {}}
                      onReorderSubtasks={() => {}}
                      hasCycle={() => false}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {!readOnly && topLevelTasks.length > 0 && (
            <div className="phase-foot">
              <button className="add-task-btn" onClick={() => onAddTask(phase.id)}>
                <Icon name="plus" size={14} /> Add task
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
