'use client'

import React from 'react'
import { Icon } from '@/components/ui/Icon'
import { PhaseNameEditor } from './PhaseNameEditor'
import { PhaseSettingsMenu } from './PhaseSettingsMenu'
import type { Phase as PhaseType } from '@/types/roadmap'

interface PhaseHeaderProps {
  phase: PhaseType
  isActive: boolean
  displayStatus: PhaseType['status']
  doneCount: number
  readOnly: boolean
  isColorLockedByOther: boolean
  colorLockDisplayName?: string
  showColorPicker: boolean
  renameKey?: number
  dragHandleProps?: React.HTMLAttributes<Element>
  colorControlRef: React.RefObject<HTMLDivElement | null>
  onPhaseToggle: () => void
  onNameSave: (name: string) => void
  onNameEditingChange: (editing: boolean) => void
  onMenuRename: () => void
  onColorTriggerClick: () => void
  onColorSelect: (color: string) => void
  onColorModeSelect: (mode: 'auto' | 'manual') => void
  colorReason: string
  displayColor: string
  onDeletePhase: (phaseId: string) => void
  onSettingsMenuChange?: (open: boolean) => void
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
  renameKey,
  dragHandleProps,
  colorControlRef,
  onPhaseToggle,
  onNameSave,
  onNameEditingChange,
  onMenuRename,
  onColorTriggerClick,
  onColorSelect,
  onColorModeSelect,
  colorReason,
  displayColor,
  onDeletePhase,
  onSettingsMenuChange,
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
        renameKey={renameKey}
        onPhaseToggle={onPhaseToggle}
        onSave={onNameSave}
        onEditingChange={onNameEditingChange}
      />
      {isColorLockedByOther && (
        <span className="phase-lock-pill">
          <Icon name="shield" size={11} /> {colorLockDisplayName ?? 'Someone'} is editing
        </span>
      )}
      {!readOnly && !isColorLockedByOther && (
        <PhaseSettingsMenu
          phase={phase}
          readOnly={readOnly}
          isColorLockedByOther={isColorLockedByOther}
          showColorPicker={showColorPicker}
          containerRef={colorControlRef}
          onRenameClick={onMenuRename}
          onColorTriggerClick={onColorTriggerClick}
          onColorSelect={onColorSelect}
          onColorModeSelect={onColorModeSelect}
          colorReason={colorReason}
          displayColor={displayColor}
          onDeletePhase={onDeletePhase}
          onMenuOpenChange={onSettingsMenuChange}
        />
      )}
    </div>
  )
}
