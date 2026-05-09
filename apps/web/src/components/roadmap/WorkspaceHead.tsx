'use client'

import { Icon } from '@/components/ui/Icon'

interface WorkspaceHeadProps {
  roadmapName: string
  totalDone: number
  totalTasks: number
  phaseCount: number
  saved: boolean
  nextReadyCount: number
}

export function WorkspaceHead({
  roadmapName,
  totalDone,
  totalTasks,
  phaseCount,
  saved,
  nextReadyCount,
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
        {nextReadyCount > 0 && (
          <span className="ember">
            <Icon name="flame" size={14} stroke="var(--ember)" /> {nextReadyCount}{' '}
            {nextReadyCount === 1 ? 'task' : 'tasks'} ready next
          </span>
        )}
        {saved && (
          <span>
            <Icon name="users" size={14} /> Collaboration enabled
          </span>
        )}
      </div>
    </div>
  )
}
