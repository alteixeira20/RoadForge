'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { TaskFilter, WorkspaceView } from '@/types/roadmap'

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
  workspaceView: WorkspaceView
  onWorkspaceViewChange: (view: WorkspaceView) => void
  allOpen: boolean
  onCollapseAll: () => void
  onExpandAll: () => void
  onOpenActivity: () => void
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
  workspaceView,
  onWorkspaceViewChange,
  allOpen,
  onCollapseAll,
  onExpandAll,
  onOpenActivity,
  onOpenVersions,
  hasServerActivity,
  canViewTeam,
  canViewVersions,
}: WorkspaceToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
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

  useEffect(() => {
    if (workspaceView !== 'roadmap') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [workspaceView])

  return (
    <div className="workspace-bar">
      <div className="workspace-view-tabs" aria-label="Workspace views">
        <button
          type="button"
          className={`workspace-view-tab ${workspaceView === 'roadmap' ? 'active' : ''}`}
          onClick={() => onWorkspaceViewChange('roadmap')}
        >
          <Icon name="fold" size={14} /> Roadmap
        </button>
        {canViewTeam && (
          <button
            type="button"
            className={`workspace-view-tab ${workspaceView === 'team' ? 'active' : ''}`}
            onClick={() => onWorkspaceViewChange('team')}
            title="View joined collaborators"
          >
            <Icon name="users" size={14} /> Team
          </button>
        )}
      </div>

      {workspaceView === 'roadmap' && (
        <div className="toolbar-start">
          <div className="search">
            <Icon name="search" size={15} stroke="var(--ink-3)" />
            <input
              ref={searchRef}
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
            className="toolbar-action"
            onClick={allOpen ? onCollapseAll : onExpandAll}
          >
            <Icon name="fold" size={14} /> {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}

      <div className="toolbar-end">
        <button
          className="toolbar-action"
          onClick={onOpenActivity}
          disabled={!hasServerActivity}
          title={hasServerActivity ? 'View recent activity' : 'Activity appears after saving or syncing this roadmap.'}
        >
          <Icon name="activity" size={14} /> Activity
        </button>

        {canViewVersions && (
          <button
            className="toolbar-action"
            onClick={onOpenVersions}
            title="View and restore roadmap versions"
          >
            <Icon name="clock" size={14} /> Versions
          </button>
        )}
      </div>
    </div>
  )
}
