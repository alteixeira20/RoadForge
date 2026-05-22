'use client'

import { Icon } from '@/components/ui/Icon'
import type { TaskFilter } from '@/types/roadmap'

interface TaskFilterOption {
  value: TaskFilter
  label: string
}

interface WorkspaceToolbarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  taskFilter: TaskFilter
  taskFilterOptions: TaskFilterOption[]
  onTaskFilterChange: (filter: TaskFilter) => void
  allOpen: boolean
  onCollapseAll: () => void
  onExpandAll: () => void
  onOpenActivity: () => void
  onOpenTeam: () => void
  onOpenVersions: () => void
  hasServerActivity: boolean
  canViewTeam: boolean
  canViewVersions: boolean
}

export function WorkspaceToolbar({
  searchQuery,
  onSearchChange,
  taskFilter,
  taskFilterOptions,
  onTaskFilterChange,
  allOpen,
  onCollapseAll,
  onExpandAll,
  onOpenActivity,
  onOpenTeam,
  onOpenVersions,
  hasServerActivity,
  canViewTeam,
  canViewVersions,
}: WorkspaceToolbarProps) {
  return (
    <div className="workspace-bar">
      <div className="search">
        <Icon name="search" size={15} stroke="var(--ink-3)" />
        <input
          placeholder="Search this roadmap…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <span className="kbd">⌘ K</span>
      </div>

      <label className="task-filter">
        <span>Filter</span>
        <select
          value={taskFilter}
          onChange={(e) => onTaskFilterChange(e.target.value as TaskFilter)}
        >
          {taskFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      
      <button
        className="collapse-all"
        onClick={allOpen ? onCollapseAll : onExpandAll}
      >
        <Icon name="fold" size={14} /> {allOpen ? 'Collapse all' : 'Expand all'}
      </button>

      <button
        className="collapse-all"
        onClick={onOpenActivity}
        title={hasServerActivity ? 'View recent activity' : 'Activity logs become available after saving to RoadForge.'}
      >
        <Icon name="activity" size={14} /> Activity
      </button>

      {canViewTeam && (
        <button
          className="collapse-all"
          onClick={onOpenTeam}
          title="View assigned work by person"
        >
          <Icon name="users" size={14} /> Team
        </button>
      )}

      {canViewVersions && (
        <button
          className="collapse-all"
          onClick={onOpenVersions}
          title="View and restore roadmap versions"
        >
          <Icon name="clock" size={14} /> Versions
        </button>
      )}
    </div>
  )
}
