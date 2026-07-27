'use client'

import { memo, useState } from 'react'
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
  MeasuringStrategy,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

// Collapsing a phase changes its (and its siblings') rects with no drag in
// progress yet. The default `WhileDragging` strategy only remeasures once a
// drag has already started, so a keyboard drag initiated immediately after
// a collapse can briefly compute positions against stale rects. `Always`
// keeps droppable rects continuously current instead. Defined once at
// module scope so the object identity stays stable across renders.
const measuring = { droppable: { strategy: MeasuringStrategy.Always } }
import { Icon } from '@/components/ui/Icon'
import { SortablePhaseItem } from './SortablePhaseItem'
import type { ToastTone } from '@/hooks/useToastState'
import type { TaskUpdateHandler } from '@/hooks/taskMutationHelpers'
import type { Phase as PhaseType, Task } from '@/types/roadmap'

interface PhaseListProps {
  phases: PhaseType[]
  openPhases: string[]
  expandedTaskId: string | null
  allTasks: Task[]
  readOnly: boolean
  hasRoadmapPhases: boolean
  totalPhaseCount: number
  isFiltering: boolean
  emptyStateMessage: string
  onClearFilters: () => void
  onAddPhase: () => void
  phaseNameEditRequestId: string | null
  onPhaseNameEditRequestHandled: () => void
  onTogglePhase: (id: string) => void
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
  onReorderPhases: (phaseIds: string[]) => void
  hasCycle: (taskId: string, depId: string) => boolean
  assignmentNames: string[]
  onToast: (message: string, tone?: ToastTone) => void
}

function PhaseListComponent({
  phases,
  openPhases,
  expandedTaskId,
  allTasks,
  readOnly,
  hasRoadmapPhases,
  totalPhaseCount,
  isFiltering,
  emptyStateMessage,
  onClearFilters,
  onAddPhase,
  phaseNameEditRequestId,
  onPhaseNameEditRequestHandled,
  onTogglePhase,
  onToggleTask,
  onCheckTask,
  pendingTaskDoneIds,
  onUpdateTask,
  onUpdatePhaseColor,
  onUpdatePhaseColorMode,
  onUpdatePhaseName,
  onDeletePhase,
  onAddTask,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  onReorderTasks,
  onReorderSubtasks,
  onDeleteSubtask,
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

  if (!hasRoadmapPhases) {
    return (
      <div className="phases">
        <div className="zero-phase-state" role="status">
          <strong>No phases yet</strong>
          <p>
            {readOnly
              ? 'This roadmap has no phases. Viewers cannot create phases.'
              : 'Create a first phase to continue planning.'}
          </p>
          {!readOnly && (
            <button type="button" className="btn primary" onClick={onAddPhase}>
              <Icon name="plus" size={14} /> Create first phase
            </button>
          )}
        </div>
      </div>
    )
  }

  if (isFiltering && phases.length === 0) {
    return (
      <div className="phases">
        <div className="filtered-empty-state" role="status">
          <strong>No matching tasks</strong>
          <p>{emptyStateMessage}</p>
          <button type="button" className="btn secondary" onClick={onClearFilters}>
            Clear search and filters
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <DndContext
        id="roadmap-phases"
        sensors={sensors}
        collisionDetection={closestCenter}
        measuring={measuring}
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
                isOnlyPhase={totalPhaseCount === 1}
                dragDisabled={phaseDragDisabled}
                isOpen={openPhases.includes(p.id)}
                onToggle={onTogglePhase}
                expandedTaskId={expandedTaskId}
                onToggleTask={onToggleTask}
                onCheckTask={onCheckTask}
                pendingTaskDoneIds={pendingTaskDoneIds}
                onUpdateTask={onUpdateTask}
                onUpdatePhaseColor={onUpdatePhaseColor}
                onUpdatePhaseColorMode={onUpdatePhaseColorMode}
                onUpdatePhaseName={onUpdatePhaseName}
                onDeletePhase={onDeletePhase}
                onAddTask={onAddTask}
                onAddSubtask={onAddSubtask}
                onLinkDependency={onLinkDependency}
                onUnlinkDependency={onUnlinkDependency}
                onReorderTasks={onReorderTasks}
                onReorderSubtasks={onReorderSubtasks}
                onDeleteSubtask={onDeleteSubtask}
                hasCycle={hasCycle}
                allTasks={allTasks}
                readOnly={readOnly}
                beginRename={phaseNameEditRequestId === p.id}
                onBeginRenameHandled={onPhaseNameEditRequestHandled}
                assignmentNames={assignmentNames}
                onToast={onToast}
              />
            ))}
            {!readOnly && !isFiltering && (
              <button
                type="button"
                className="add-phase-after-list"
                onClick={onAddPhase}
              >
                <Icon name="plus" size={14} /> Add another phase
              </button>
            )}
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

export const PhaseList = memo(PhaseListComponent)
