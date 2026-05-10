'use client'

import { Icon } from '@/components/ui/Icon'
import { Phase } from './Phase'
import type { Phase as PhaseType, Task } from '@/types/roadmap'

interface PhaseListProps {
  phases: PhaseType[]
  openPhases: string[]
  expandedTaskId: string | null
  allTasks: Task[]
  readOnly: boolean
  onTogglePhase: (id: string) => void
  onToggleTask: (id: string) => void
  onCheckTask: (id: string) => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onAddSubtask: (parentId: string, title: string) => void
  onLinkDependency: (taskId: string, depId: string) => void
  onUnlinkDependency: (taskId: string, depId: string) => void
  onReorderTasks: (phaseId: string, taskIds: string[]) => void
  onReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
  hasCycle: (taskId: string, depId: string) => boolean
}

export function PhaseList({
  phases,
  openPhases,
  expandedTaskId,
  allTasks,
  readOnly,
  onTogglePhase,
  onToggleTask,
  onCheckTask,
  onUpdateTask,
  onAddSubtask,
  onLinkDependency,
  onUnlinkDependency,
  onReorderTasks,
  onReorderSubtasks,
  hasCycle,
}: PhaseListProps) {
  return (
    <>
      <div className="phases">
        {phases.map((p) => (
          <Phase
            key={p.id}
            phase={p}
            isOpen={openPhases.includes(p.id)}
            onToggle={onTogglePhase}
            expandedTaskId={expandedTaskId}
            onToggleTask={onToggleTask}
            onCheckTask={onCheckTask}
            onUpdateTask={onUpdateTask}
            onAddSubtask={onAddSubtask}
            onLinkDependency={onLinkDependency}
            onUnlinkDependency={onUnlinkDependency}
            onReorderTasks={onReorderTasks}
            onReorderSubtasks={onReorderSubtasks}
            hasCycle={hasCycle}
            allTasks={allTasks}
            readOnly={readOnly}
          />
        ))}
      </div>
      {!readOnly && (
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
          <button className="btn ghost">
            <Icon name="plus" size={14} /> Add phase
          </button>
        </div>
      )}
    </>
  )
}
