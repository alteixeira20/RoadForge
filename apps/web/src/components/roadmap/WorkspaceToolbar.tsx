'use client'

import { Icon } from '@/components/ui/Icon'

interface WorkspaceToolbarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  allOpen: boolean
  onCollapseAll: () => void
  onExpandAll: () => void
}

export function WorkspaceToolbar({
  searchQuery,
  onSearchChange,
  allOpen,
  onCollapseAll,
  onExpandAll,
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
      <button
        className="collapse-all"
        onClick={allOpen ? onCollapseAll : onExpandAll}
      >
        <Icon name="fold" size={14} /> {allOpen ? 'Collapse all' : 'Expand all'}
      </button>
    </div>
  )
}
