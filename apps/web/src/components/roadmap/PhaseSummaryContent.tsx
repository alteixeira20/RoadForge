'use client'

import type React from 'react'
import { Icon } from '@/components/ui/Icon'
import type { Phase as PhaseType } from '@/types/roadmap'
import type { ForgeStyle } from '@/types/ui'

function phaseStatusLabel(status: PhaseType['status']): string {
  switch (status) {
    case 'done':   return 'Complete'
    case 'active': return 'In progress'
    case 'next':   return 'Up next'
    default:       return 'Future'
  }
}

interface PhaseSummaryContentProps {
  name: string
  num: string
  editing: boolean
  draft: string
  isActive: boolean
  displayStatus: PhaseType['status']
  progressPercent: number
  doneCount: number
  taskCount: number
  readOnly: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onDraftChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onDoubleClick: (e: React.MouseEvent) => void
}

export function PhaseSummaryContent({
  name,
  num,
  editing,
  draft,
  isActive,
  displayStatus,
  progressPercent,
  doneCount,
  taskCount,
  readOnly,
  inputRef,
  onDraftChange,
  onKeyDown,
  onDoubleClick,
}: PhaseSummaryContentProps) {
  const progressStyle: ForgeStyle = { '--p': `${progressPercent}%` }

  return (
    <>
      <span className="chev">
        <Icon name="chevron-right" size={16} />
      </span>
      <span className="num">{num}</span>
      {editing ? (
        <input
          ref={inputRef}
          className="phase-name-input"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          maxLength={120}
        />
      ) : (
        <span
          className={`name${readOnly ? '' : ' editable'}`}
          onDoubleClick={onDoubleClick}
          title={readOnly ? undefined : 'Double-click to rename'}
        >
          {name}
        </span>
      )}
      <span className={`status ${isActive ? 'active' : ''}`}>
        {phaseStatusLabel(displayStatus)}
      </span>
      <span className="progress-mini" style={progressStyle}>
        <i />
      </span>
      <span className="count">
        {doneCount}/{taskCount}
      </span>
    </>
  )
}
