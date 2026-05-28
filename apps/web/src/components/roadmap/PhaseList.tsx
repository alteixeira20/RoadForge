'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
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
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortablePhaseItem } from './SortablePhaseItem'
import type { Phase as PhaseType, Task } from '@/types/roadmap'

interface PhaseListProps {
  phases: PhaseType[]
  openPhases: string[]
  expandedTaskId: string | null
  allTasks: Task[]
  readOnly: boolean
  isFiltering: boolean
  onTogglePhase: (id: string) => void
  onToggleTask: (id: string) => void
  onCheckTask: (id: string) => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onUpdatePhaseColor: (phaseId: string, color: string) => void
  onAddTask: (phaseId: string) => void
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  onReorderTasks: (phaseId: string, taskIds: string[]) => void
  onReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
  onReorderPhases: (phaseIds: string[]) => void
  hasCycle: (taskId: string, depId: string) => boolean
  assignmentNames: string[]
  onToast: (message: string) => void
}

export function PhaseList({
  phases,
  openPhases,
  expandedTaskId,
  allTasks,
  readOnly,
  isFiltering,
  onTogglePhase,
  onToggleTask,
  onCheckTask,
  onUpdateTask,
  onUpdatePhaseColor,
  onAddTask,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  onReorderTasks,
  onReorderSubtasks,
  onReorderPhases,
  hasCycle,
  assignmentNames,
  onToast,
}: PhaseListProps) {
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null)

  const phaseDragDisabled = readOnly || isFiltering
  const phaseIds = phases.map((p) => p.id)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActivePhaseId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActivePhaseId(null)
    if (over && active.id !== over.id) {
      const oldIndex = phaseIds.indexOf(active.id as string)
      const newIndex = phaseIds.indexOf(over.id as string)
      onReorderPhases(arrayMove(phaseIds, oldIndex, newIndex))
    }
  }

  const handleDragCancel = () => {
    setActivePhaseId(null)
  }

  const activePhase = activePhaseId ? phases.find((p) => p.id === activePhaseId) : null

  if (isFiltering && phases.length === 0) {
    return (
      <div className="phases">
        <div className="filtered-empty-state" role="status">
          <strong>No matching tasks</strong>
          <p>No tasks match the current search or filter.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={phaseIds} strategy={verticalListSortingStrategy}>
          <div className="phases">
            {phases.map((p) => (
              <SortablePhaseItem
                key={p.id}
                phase={p}
                dragDisabled={phaseDragDisabled}
                isOpen={openPhases.includes(p.id)}
                onToggle={onTogglePhase}
                expandedTaskId={expandedTaskId}
                onToggleTask={onToggleTask}
                onCheckTask={onCheckTask}
                onUpdateTask={onUpdateTask}
                onUpdatePhaseColor={onUpdatePhaseColor}
                onAddTask={onAddTask}
                onAddSubtask={onAddSubtask}
                onLinkDependency={onLinkDependency}
                onUnlinkDependency={onUnlinkDependency}
                onReorderTasks={onReorderTasks}
                onReorderSubtasks={onReorderSubtasks}
                hasCycle={hasCycle}
                allTasks={allTasks}
                readOnly={readOnly}
                assignmentNames={assignmentNames}
                onToast={onToast}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay
          dropAnimation={{
            duration: 110,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
            sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
          }}
        >
          {activePhase ? (
            <div className="phase-sortable-overlay">
              <span className="phase-overlay-num">{activePhase.num}</span>
              <span className="phase-overlay-name">{activePhase.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  )
}
