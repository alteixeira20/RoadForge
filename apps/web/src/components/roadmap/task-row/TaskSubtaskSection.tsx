import type { Task } from '@/types/roadmap'
import { TaskSubtaskList } from '../TaskSubtaskList'

interface TaskSubtaskSectionProps {
  parentId: string
  subtasks: Task[]
  readOnly: boolean
  pendingTaskDoneIds: ReadonlySet<string>
  onCheck: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (parentId: string, subtaskIds: string[]) => void
  parentDisplayNumber?: string
}

export function TaskSubtaskSection({
  parentId,
  subtasks,
  readOnly,
  pendingTaskDoneIds,
  onCheck,
  onDelete,
  onReorder,
  parentDisplayNumber,
}: TaskSubtaskSectionProps) {
  if (subtasks.length === 0) return null

  return (
    <div className="task-detail-section">
      <div className="section-label">Subtasks</div>
      <div className="subtasks">
        <TaskSubtaskList
          parentId={parentId}
          subtasks={subtasks}
          readOnly={readOnly}
          pendingTaskDoneIds={pendingTaskDoneIds}
          onCheck={onCheck}
          onDelete={onDelete}
          onReorder={onReorder}
          parentDisplayNumber={parentDisplayNumber}
        />
      </div>
    </div>
  )
}
