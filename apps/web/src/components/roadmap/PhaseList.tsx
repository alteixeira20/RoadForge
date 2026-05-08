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
