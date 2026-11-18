'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useCoordinatedKeyboardReorder, useKeyboardReorderCoordinator } from '@/hooks/useKeyboardReorderCoordinator'
import { SubtaskRow } from './SubtaskRow'
import { SortableSubtaskItem } from './SortableSubtaskItem'
import type { Task } from '@/types/roadmap'

interface TaskSubtaskListProps {
  parentId: string
  subtasks: Task[]
  readOnly: boolean
  pendingTaskDoneIds: ReadonlySet<string>
  onCheck: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (parentId: string, subtaskIds: string[]) => void
  parentDisplayNumber?: string
}

export function TaskSubtaskList({
  parentId,
  subtasks,
  readOnly,
  pendingTaskDoneIds,
  onCheck,
  onDelete,
  onReorder,
  parentDisplayNumber,
}: TaskSubtaskListProps) {
  const [activeSubtaskId, setActiveSubtaskId] = useState<string | null>(null)
  const activeSubtask = activeSubtaskId ? subtasks.find((t) => t.id === activeSubtaskId) ?? null : null
  const subtaskIds = subtasks.map((t) => t.id)
  const listId = `task-subtasks-${parentId}`

  const coordinator = useKeyboardReorderCoordinator()
  const keyboardReorder = useCoordinatedKeyboardReorder(listId, subtaskIds, {
    disabled: readOnly,
    itemLabel: (id) => `subtask ${subtasks.find((t) => t.id === id)?.title ?? ''}`,
    onCommit: (orderedIds) => onReorder(parentId, orderedIds),
  })

  // Preview-then-commit (RF-034): render in preview order while a keyboard
  // reorder session targets this list, without mutating `subtasks` itself.
  const displaySubtaskIds = keyboardReorder.previewIds ?? subtaskIds
  const displaySubtasks = keyboardReorder.previewIds
    ? displaySubtaskIds
        .map((id) => subtasks.find((t) => t.id === id))
        .filter((t): t is Task => t !== undefined)
    : subtasks

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  return (
    <DndContext
      id={listId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => {
        setActiveSubtaskId(e.active.id as string)
        // A pointer drag starting anywhere must pre-empt an in-progress
        // keyboard reorder session, even one targeting a different list.
        coordinator.cancelActive()
      }}
      onDragEnd={(e) => {
        const { active, over } = e
        setActiveSubtaskId(null)
        if (!over || active.id === over.id) return
        const oldIdx = subtaskIds.indexOf(active.id as string)
        const newIdx = subtaskIds.indexOf(over.id as string)
        if (oldIdx < 0 || newIdx < 0) return
        onReorder(parentId, arrayMove(subtaskIds, oldIdx, newIdx))
      }}
      onDragCancel={() => setActiveSubtaskId(null)}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext items={displaySubtaskIds} strategy={verticalListSortingStrategy}>
        {displaySubtasks.map((st, idx) => (
          <SortableSubtaskItem
            key={st.id}
            task={st}
            readOnly={readOnly}
            pendingTaskDoneIds={pendingTaskDoneIds}
            dragDisabled={readOnly}
            isKeyboardActive={keyboardReorder.activeId === st.id}
            onKeyboardKeyDown={(event) => keyboardReorder.handleKeyDown(event, st.id)}
            onKeyboardBlur={keyboardReorder.cancel}
            onCheck={onCheck}
            onDelete={onDelete}
            displayNumber={parentDisplayNumber ? `${parentDisplayNumber}.${idx + 1}` : undefined}
          />
        ))}
      </SortableContext>
      <DragOverlay
        dropAnimation={{
          duration: 110,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
          sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
        }}
      >
        {activeSubtask ? (
          <div className="sortable-dragging-overlay">
            <SubtaskRow
              task={activeSubtask}
              readOnly
              pendingTaskDoneIds={new Set()}
              onCheck={() => {}}
              onDelete={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
