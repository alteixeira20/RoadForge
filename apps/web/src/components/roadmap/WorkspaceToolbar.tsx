'use client'

import { Icon } from '@/components/ui/Icon'

interface WorkspaceToolbarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  allOpen: boolean
  onCollapseAll: () => void
  onExpandAll: () => void
  onOpenActivity: () => void
  isSaved: boolean
}

export function WorkspaceToolbar({
  searchQuery,
  onSearchChange,
  allOpen,
  onCollapseAll,
  onExpandAll,
  onOpenActivity,
  isSaved,
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

      <button
        className="collapse-all"
        onClick={onOpenActivity}
        disabled={!isSaved}
        title={!isSaved ? 'Save roadmap to enable activity' : 'View recent activity'}
        style={{ opacity: !isSaved ? 0.5 : 1, cursor: !isSaved ? 'not-allowed' : 'pointer' }}
      >
        <Icon name="activity" size={14} /> Activity
      </button>
    </div>
  )
}
