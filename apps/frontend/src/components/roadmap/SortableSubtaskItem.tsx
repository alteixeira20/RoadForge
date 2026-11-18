'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SubtaskRow } from './SubtaskRow'
import type { Task } from '@/types/roadmap'

interface SortableSubtaskItemProps {
  task: Task
  readOnly: boolean
  pendingTaskDoneIds: ReadonlySet<string>
  dragDisabled: boolean
  isKeyboardActive: boolean
  onKeyboardKeyDown: (event: { code: string; preventDefault: () => void }) => void
  onKeyboardBlur: () => void
  onCheck: (id: string) => void
  onDelete: (id: string) => void
  displayNumber?: string
}

export function SortableSubtaskItem({
  task,
  dragDisabled,
  isKeyboardActive,
  onKeyboardKeyDown,
  onKeyboardBlur,
  ...rowProps
}: SortableSubtaskItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
    transition: { duration: 130, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  })

  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'sortable-dragging' : ''}>
      <SubtaskRow
        {...rowProps}
        task={task}
        dragHandleProps={dragDisabled ? undefined : {
          ...attributes,
          ...listeners,
          'aria-pressed': isDragging || isKeyboardActive,
          onKeyDown: onKeyboardKeyDown,
          onBlur: onKeyboardBlur,
        }}
      />
    </div>
  )
}
