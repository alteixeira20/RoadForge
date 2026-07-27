'use client'

import { useRef, useState } from 'react'
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
import { useKeyboardReorder } from '@/hooks/useKeyboardReorder'
import { KeyboardReorderAnnouncer } from './KeyboardReorderAnnouncer'
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
  const subtaskIdsRef = useRef(subtaskIds)
  subtaskIdsRef.current = subtaskIds

  const keyboardReorder = useKeyboardReorder(() => subtaskIdsRef.current, {
    disabled: readOnly,
    itemLabel: (id) => `subtask ${subtasks.find((t) => t.id === id)?.title ?? ''}`,
    onReorder: (fromIndex, toIndex) => {
      onReorder(parentId, arrayMove(subtaskIdsRef.current, fromIndex, toIndex))
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  return (
    <DndContext
      id={`task-subtasks-${parentId}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveSubtaskId(e.active.id as string)}
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
      <SortableContext items={subtaskIds} strategy={verticalListSortingStrategy}>
        {subtasks.map((st, idx) => (
          <SortableSubtaskItem
            key={st.id}
            task={st}
            readOnly={readOnly}
            pendingTaskDoneIds={pendingTaskDoneIds}
            dragDisabled={readOnly}
            isKeyboardActive={keyboardReorder.activeId === st.id}
            onKeyboardKeyDown={(event) => keyboardReorder.handleKeyDown(event, st.id)}
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
      <KeyboardReorderAnnouncer message={keyboardReorder.announcement} />
    </DndContext>
  )
}
