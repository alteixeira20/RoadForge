'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskRow } from './TaskRow'
import type { Task } from '@/types/roadmap'

interface SortableTaskItemProps {
  task: Task
  allTasks: Task[]
  expanded: boolean
  expandedTaskId: string | null
  readOnly: boolean
  dragDisabled: boolean
  onToggle: (id: string) => void
  onCheck: (id: string) => void
  pendingTaskDoneIds: ReadonlySet<string>
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onAddTask: (phaseId: string) => void
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  onReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
  onDeleteSubtask: (subtaskId: string) => void
  hasCycle: (taskId: string, depId: string) => boolean
  onToast: (message: string) => void
  assignmentNames: string[]
  startEditing?: boolean
  onDirtyChange?: (taskId: string, dirty: boolean) => void
}

export function SortableTaskItem(props: SortableTaskItemProps) {
  const { task, expanded, readOnly, dragDisabled } = props
  
  // Disable drag if the task itself is expanded, or if phase-level drag is disabled
  const isDragDisabled = readOnly || expanded || dragDisabled

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: isDragDisabled,
    transition: {
      duration: 130,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative' as const, zIndex: 10 } : {}),
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'sortable-dragging' : ''}>
      <TaskRow
        {...props}
        dragHandleProps={isDragDisabled ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  )
}
