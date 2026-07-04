'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Phase } from './Phase'
import type { TaskUpdateHandler } from '@/hooks/taskMutationHelpers'
import type { Phase as PhaseType, Task } from '@/types/roadmap'

interface SortablePhaseItemProps {
  phase: PhaseType
  dragDisabled: boolean
  isOpen: boolean
  onToggle: (id: string) => void
  expandedTaskId: string | null
  onToggleTask: (id: string) => void
  onCheckTask: (id: string) => void
  pendingTaskDoneIds: ReadonlySet<string>
  onUpdateTask: TaskUpdateHandler
  onUpdatePhaseColor: (phaseId: string, color: string) => void
  onUpdatePhaseColorMode: (phaseId: string, mode: 'auto' | 'manual') => void
  onUpdatePhaseName: (phaseId: string, name: string) => void
  onDeletePhase: (phaseId: string) => void
  onAddTask: (phaseId: string, title?: string) => string
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  onReorderTasks: (phaseId: string, taskIds: string[]) => void
  onReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
  onDeleteSubtask: (subtaskId: string) => void
  hasCycle: (taskId: string, depId: string) => boolean
  allTasks: Task[]
  readOnly: boolean
  assignmentNames: string[]
  onToast: (message: string) => void
}

export function SortablePhaseItem({ phase, dragDisabled, ...phaseProps }: SortablePhaseItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: phase.id,
    disabled: dragDisabled,
    transition: {
      duration: 200,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'phase-sortable-dragging' : undefined}
    >
      <Phase
        {...phaseProps}
        phase={phase}
        dragHandleProps={dragDisabled ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  )
}
