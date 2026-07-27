'use client'

import { useEffect } from 'react'
import { useDndContext } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskRow } from './TaskRow'
import type { TaskUpdateHandler } from '@/hooks/taskMutationHelpers'
import type { Task } from '@/types/roadmap'

interface SortableTaskItemProps {
  task: Task
  allTasks: Task[]
  expanded: boolean
  expandedTaskId: string | null
  readOnly: boolean
  dragDisabled: boolean
  isKeyboardActive: boolean
  onKeyboardKeyDown: (event: { code: string; preventDefault: () => void }) => void
  onToggle: (id: string) => void
  onCheck: (id: string) => void
  pendingTaskDoneIds: ReadonlySet<string>
  onUpdateTask: TaskUpdateHandler
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
  displayNumber?: string
}

export function SortableTaskItem({
  isKeyboardActive,
  onKeyboardKeyDown,
  ...props
}: SortableTaskItemProps) {
  const { task, expanded, readOnly, dragDisabled } = props

  // Expanding a task only suppresses *initiating* a drag from it — it must
  // stay a valid drop target (droppable) so a sibling being keyboard-moved
  // can still land on/around it right after it collapses. A plain boolean
  // `disabled` here would drop both at once, deregistering it as a drop
  // target for as long as it's expanded.
  const isDragInitiationDisabled = readOnly || expanded || dragDisabled
  const isDroppableDisabled = readOnly || dragDisabled

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: { draggable: isDragInitiationDisabled, droppable: isDroppableDisabled },
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

  // dnd-kit only auto-remeasures a droppable's rect via ResizeObserver while
  // a drag is active — collapsing a task changes layout with no drag in
  // progress, so nothing would normally pick that up before the *next*
  // drag starts. Ask the DndContext to remeasure every droppable as soon as
  // this task's expand state (and thus its height) actually changes, well
  // before a keyboard drag can begin, instead of racing a stale rect cache
  // against the user's next keypress.
  const { measureDroppableContainers } = useDndContext()
  useEffect(() => {
    measureDroppableContainers([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'sortable-dragging' : ''}>
      <TaskRow
        {...props}
        dragHandleProps={isDragInitiationDisabled ? undefined : {
          ...attributes,
          ...listeners,
          'aria-pressed': isDragging || isKeyboardActive,
          onKeyDown: onKeyboardKeyDown,
        }}
      />
    </div>
  )
}
