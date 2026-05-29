'use client'

import React from 'react'
import { Icon } from '@/components/ui/Icon'
import { PhaseNameEditor } from './PhaseNameEditor'
import type { Phase as PhaseType } from '@/types/roadmap'

const PHASE_COLOR_PRESETS = [
  { label: 'Orange', value: '#f97316' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Blue', value: '#38bdf8' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Slate', value: '#64748b' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Cyan', value: '#0ea5e9' },
]

interface PhaseHeaderProps {
  phase: PhaseType
  isActive: boolean
  displayStatus: PhaseType['status']
  doneCount: number
  readOnly: boolean
  isColorLockedByOther: boolean
  colorLockDisplayName?: string
  showColorPicker: boolean
  dragHandleProps?: React.HTMLAttributes<Element>
  colorControlRef: React.RefObject<HTMLDivElement | null>
  onPhaseToggle: () => void
  onBeforeNameEdit: () => Promise<boolean>
  onNameSave: (name: string) => void
  onNameEditingChange: (editing: boolean) => void
  onColorTriggerClick: () => void
  onColorSelect: (color: string) => void
}

export function PhaseHeader({
  phase,
  isActive,
  displayStatus,
  doneCount,
  readOnly,
  isColorLockedByOther,
  colorLockDisplayName,
  showColorPicker,
  dragHandleProps,
  colorControlRef,
  onPhaseToggle,
  onBeforeNameEdit,
  onNameSave,
  onNameEditingChange,
  onColorTriggerClick,
  onColorSelect,
}: PhaseHeaderProps) {
  return (
    <div className="phase-head">
      {dragHandleProps && (
        <span
          className="phase-drag-handle"
          {...(dragHandleProps as React.HTMLAttributes<HTMLSpanElement>)}
        >
          <Icon name="grip" size={14} />
        </span>
      )}
      <PhaseNameEditor
        name={phase.name}
        num={phase.num}
        isActive={isActive}
        displayStatus={displayStatus}
        progressPercent={phase.progress}
        doneCount={doneCount}
        taskCount={phase.tasks.length}
        readOnly={readOnly}
        isLockedByOther={isColorLockedByOther}
        onPhaseToggle={onPhaseToggle}
        onBeforeEdit={onBeforeNameEdit}
        onSave={onNameSave}
        onEditingChange={onNameEditingChange}
      />
      {isColorLockedByOther && (
        <span className="phase-lock-pill">
          <Icon name="shield" size={11} /> {colorLockDisplayName ?? 'Someone'} is editing
        </span>
      )}
      {!readOnly && !isColorLockedByOther && (
        <div ref={colorControlRef} className="phase-color-control">
          <button
            type="button"
            className="phase-color-trigger"
            title="Change phase color"
            aria-label={`Change color for ${phase.name}`}
            aria-expanded={showColorPicker}
            onClick={(e) => {
              e.stopPropagation()
              onColorTriggerClick()
            }}
          >
            <span style={{ backgroundColor: phase.color }} />
          </button>
          {showColorPicker && (
            <div className="phase-color-popover" role="menu" aria-label="Phase colors">
              {PHASE_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={preset.value.toLowerCase() === phase.color.toLowerCase() ? 'selected' : ''}
                  title={preset.label}
                  aria-label={preset.label}
                  onClick={() => onColorSelect(preset.value)}
                >
                  <span style={{ backgroundColor: preset.value }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
