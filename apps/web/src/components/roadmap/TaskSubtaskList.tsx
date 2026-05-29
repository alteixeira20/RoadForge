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
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SubtaskRow } from './SubtaskRow'
import { SortableSubtaskItem } from './SortableSubtaskItem'
import type { Task } from '@/types/roadmap'

interface TaskSubtaskListProps {
  parentId: string
  subtasks: Task[]
  readOnly: boolean
  pendingTaskDoneIds: ReadonlySet<string>
  onCheck: (id: string) => void
  onUpdateTitle: (id: string, title: string) => void
  onDelete: (id: string) => void
  onReorder: (parentId: string, subtaskIds: string[]) => void
}

export function TaskSubtaskList({
  parentId,
  subtasks,
  readOnly,
  pendingTaskDoneIds,
  onCheck,
  onUpdateTitle,
  onDelete,
  onReorder,
}: TaskSubtaskListProps) {
  const [activeSubtaskId, setActiveSubtaskId] = useState<string | null>(null)
  const activeSubtask = activeSubtaskId ? subtasks.find((t) => t.id === activeSubtaskId) ?? null : null
  const subtaskIds = subtasks.map((t) => t.id)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  return (
    <DndContext
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
        {subtasks.map((st) => (
          <SortableSubtaskItem
            key={st.id}
            task={st}
            readOnly={readOnly}
            pendingTaskDoneIds={pendingTaskDoneIds}
            dragDisabled={readOnly}
            onCheck={onCheck}
            onUpdateTitle={onUpdateTitle}
            onDelete={onDelete}
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
              onUpdateTitle={() => {}}
              onDelete={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
