'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import type {
  FilterState,
  TaskClaimFilter,
  TaskStatusFilter,
  WorkspaceView,
} from '@/types/roadmap'

interface WorkspaceToolbarProps {
  filterState: FilterState
  onFilterChange: <K extends keyof FilterState>(
    field: K,
    value: FilterState[K],
  ) => void
  onClearFilters: () => void
  assignmentNames: string[]
  tagIds: string[]
  tagLabels: ReadonlyMap<string, string>
  phaseOptions: Array<{ id: string; label: string }>
  workspaceView: WorkspaceView
  onWorkspaceViewChange: (view: WorkspaceView) => void
  allOpen: boolean
  onCollapseAll: () => void
  onExpandAll: () => void
  onOpenActivity: () => void
  onOpenVersions: () => void
  onOpenTagRegistry: () => void
  hasServerActivity: boolean
  canViewTeam: boolean
  canViewVersions: boolean
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  )
}

export function WorkspaceToolbar({
  filterState,
  onFilterChange,
  onClearFilters,
  assignmentNames,
  tagIds,
  tagLabels,
  phaseOptions,
  workspaceView,
  onWorkspaceViewChange,
  allOpen,
  onCollapseAll,
  onExpandAll,
  onOpenActivity,
  onOpenVersions,
  onOpenTagRegistry,
  hasServerActivity,
  canViewTeam,
  canViewVersions,
}: WorkspaceToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const activityHelpId = useId()
  const activeCount = [
    filterState.status !== 'all',
    filterState.assignees.length > 0,
    filterState.tags.length > 0,
    filterState.phaseIds.length > 0,
    filterState.claim !== 'all',
    filterState.recommended,
  ].filter(Boolean).length

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
    <div className="workspace-toolbar-wrap">
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
                aria-label="Search roadmap tasks"
                placeholder="Search tasks, phases, tags, or people..."
                value={filterState.query}
                onChange={(event) => onFilterChange('query', event.target.value)}
              />
            </div>

            <div className="task-filter" ref={filterRef}>
              <button
                type="button"
                className={`task-filter-trigger ${filterOpen ? 'open' : ''}`}
                aria-expanded={filterOpen}
                aria-haspopup="dialog"
                onClick={() => setFilterOpen((open) => !open)}
              >
                <Icon name="filter" size={14} />
                Filters{activeCount > 0 ? ` (${activeCount})` : ''}
                <Icon name="chevron-down" size={13} />
              </button>
              {filterOpen && (
                <div className="filter-panel" role="dialog" aria-label="Task filters">
                  <FilterSelect
                    label="Status"
                    value={filterState.status}
                    onChange={(value) => onFilterChange('status', value as TaskStatusFilter)}
                  >
                    <option value="all">Any status</option>
                    <option value="open">Open</option>
                    <option value="done">Done</option>
                  </FilterSelect>
                  <FilterSelect
                    label="Assignee"
                    value=""
                    onChange={(value) => {
                      if (value && !filterState.assignees.includes(value)) {
                        onFilterChange('assignees', [...filterState.assignees, value])
                      }
                    }}
                  >
                    <option value="">Add assignee...</option>
                    <option value="__mine__">My tasks</option>
                    {assignmentNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Tag"
                    value=""
                    onChange={(value) => {
                      if (value && !filterState.tags.includes(value)) {
                        onFilterChange('tags', [...filterState.tags, value])
                      }
                    }}
                  >
                    <option value="">Add tag...</option>
                    {tagIds.map((tagId) => (
                      <option key={tagId} value={tagId}>
                        {tagLabels.get(tagId) ?? tagId}
                      </option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Phase"
                    value=""
                    onChange={(value) => {
                      if (value && !filterState.phaseIds.includes(value)) {
                        onFilterChange('phaseIds', [...filterState.phaseIds, value])
                      }
                    }}
                  >
                    <option value="">Add phase...</option>
                    {phaseOptions.map((phase) => (
                      <option key={phase.id} value={phase.id}>{phase.label}</option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Claim"
                    value={filterState.claim}
                    onChange={(value) => onFilterChange('claim', value as TaskClaimFilter)}
                  >
                    <option value="all">Any claim</option>
                    <option value="mine">Working on this</option>
                    <option value="claimed">Claimed</option>
                    <option value="unclaimed">Unclaimed</option>
                  </FilterSelect>
                  <label className="filter-checkbox">
                    <input
                      type="checkbox"
                      checked={filterState.recommended}
                      onChange={(event) =>
                        onFilterChange('recommended', event.target.checked)
                      }
                    />
                    Recommended only
                  </label>
                  <button
                    type="button"
                    className="filter-clear"
                    onClick={onClearFilters}
                    disabled={activeCount === 0}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="toolbar-action"
              onClick={allOpen ? onCollapseAll : onExpandAll}
            >
              <Icon name="fold" size={14} /> {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
        )}

        <div className="toolbar-end">
          <button
            type="button"
            className="toolbar-action"
            onClick={onOpenActivity}
            disabled={!hasServerActivity}
            aria-describedby={!hasServerActivity ? activityHelpId : undefined}
            title={hasServerActivity ? 'View recent activity' : 'Available after save or sync.'}
          >
            <Icon name="activity" size={14} /> Activity
          </button>
          {!hasServerActivity && (
            <span id={activityHelpId} className="activity-helper">
              Available after save or sync.
            </span>
          )}
          {canViewVersions && (
            <button type="button" className="toolbar-action" onClick={onOpenVersions}>
              <Icon name="clock" size={14} /> Versions
            </button>
          )}
          <button type="button" className="toolbar-action" onClick={onOpenTagRegistry}>
            Tags
          </button>
        </div>
      </div>

      {workspaceView === 'roadmap' && (
        <div className="active-filter-chips" aria-live="polite">
          {filterState.query.trim() && (
            <button type="button" onClick={() => onFilterChange('query', '')}>
              Search: {filterState.query.trim()} <span aria-hidden>×</span>
            </button>
          )}
          {filterState.status !== 'all' && (
            <button type="button" onClick={() => onFilterChange('status', 'all')}>
              Status: {filterState.status} <span aria-hidden>×</span>
            </button>
          )}
          {filterState.assignees.map((assignee) => (
            <button
              key={assignee}
              type="button"
              onClick={() => onFilterChange(
                'assignees',
                filterState.assignees.filter((value) => value !== assignee),
              )}
            >
              Assignee: {assignee === '__mine__' ? 'me' : assignee}
              {' '}<span aria-hidden>×</span>
            </button>
          ))}
          {filterState.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onFilterChange(
                'tags',
                filterState.tags.filter((value) => value !== tag),
              )}
            >
              Tag: {tagLabels.get(tag) ?? tag} <span aria-hidden>×</span>
            </button>
          ))}
          {filterState.phaseIds.map((phaseId) => (
            <button
              key={phaseId}
              type="button"
              onClick={() => onFilterChange(
                'phaseIds',
                filterState.phaseIds.filter((value) => value !== phaseId),
              )}
            >
              Phase: {phaseOptions.find((phase) => phase.id === phaseId)?.label ?? phaseId}
              {' '}<span aria-hidden>×</span>
            </button>
          ))}
          {filterState.claim !== 'all' && (
            <button type="button" onClick={() => onFilterChange('claim', 'all')}>
              Claim: {filterState.claim} <span aria-hidden>×</span>
            </button>
          )}
          {filterState.recommended && (
            <button type="button" onClick={() => onFilterChange('recommended', false)}>
              Recommended <span aria-hidden>×</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
