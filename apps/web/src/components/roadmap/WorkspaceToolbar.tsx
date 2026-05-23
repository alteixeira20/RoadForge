'use client'

import { useEffect, useRef, useState } from 'react'
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
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement | null>(null)
  const selectedFilter = taskFilterOptions.find((option) => option.value === taskFilter) ?? taskFilterOptions[0]

  useEffect(() => {
    if (!filterOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && filterRef.current?.contains(target)) return
      setFilterOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [filterOpen])

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

      <div className="task-filter" ref={filterRef}>
        <span className="task-filter-label">Filter</span>
        <button
          type="button"
          className={`task-filter-trigger ${filterOpen ? 'open' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((open) => !open)}
        >
          <span className="task-filter-current">{selectedFilter?.label ?? 'All'}</span>
          <Icon name="chevron-down" size={13} />
        </button>
        {filterOpen && (
          <div className="task-filter-menu" role="listbox" aria-label="Task filter">
            {taskFilterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === taskFilter}
                className={option.value === taskFilter ? 'selected' : ''}
                onClick={() => {
                  onTaskFilterChange(option.value)
                  setFilterOpen(false)
                }}
              >
                <span>{option.label}</span>
                {option.value === taskFilter && <Icon name="check" size={13} />}
              </button>
            ))}
          </div>
        )}
      </div>
      
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
