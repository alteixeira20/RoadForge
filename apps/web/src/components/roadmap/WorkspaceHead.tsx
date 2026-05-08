'use client'

import { Icon } from '@/components/ui/Icon'

interface WorkspaceHeadProps {
  roadmapName: string
  totalDone: number
  totalTasks: number
  phaseCount: number
  saved: boolean
}

export function WorkspaceHead({
  roadmapName,
  totalDone,
  totalTasks,
  phaseCount,
  saved,
}: WorkspaceHeadProps) {
  return (
    <div className="workspace-head">
      <div className="crumbline">Roadmap</div>
      <h1>{roadmapName}</h1>
      <div className="meta">
        <span>
          <Icon name="circle-check" size={14} /> {totalDone} of {totalTasks} done
        </span>
        <span>{phaseCount} phases</span>
        <span className="ember">
          <Icon name="flame" size={14} stroke="var(--ember)" /> 1 task ready next
        </span>
        {saved && (
          <span>
            <Icon name="users" size={14} /> 2 collaborators
          </span>
        )}
      </div>
    </div>
  )
}
