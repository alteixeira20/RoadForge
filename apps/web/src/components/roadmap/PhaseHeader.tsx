'use client'

import React from 'react'
import { Icon } from '@/components/ui/Icon'
import { PhaseNameEditor } from './PhaseNameEditor'
import { PhaseSettingsMenu } from './PhaseSettingsMenu'
import type { Phase as PhaseType } from '@/types/roadmap'

interface PhaseHeaderProps {
  phase: PhaseType
  isOnlyPhase: boolean
  isActive: boolean
  isOpen: boolean
  displayStatus: PhaseType['status']
  doneCount: number
  readOnly: boolean
  isColorLockedByOther: boolean
  colorLockDisplayName?: string
  showColorPicker: boolean
  renameKey?: number
  dragHandleProps?: React.HTMLAttributes<Element>
  onPhaseToggle: () => void
  onNameSave: (name: string) => void
  onNameEditingChange: (editing: boolean) => void
  onMenuRename: () => void
  onColorTriggerClick: () => void
  onColorClose: () => void
  onColorSelect: (color: string) => void
  onColorModeSelect: (mode: 'auto' | 'manual') => void
  onMoveEarlier?: () => void
  onMoveLater?: () => void
  colorReason: string
  displayColor: string
  onDeletePhase: (phaseId: string) => void
}

export function PhaseHeader({
  phase,
  isOnlyPhase,
  isActive,
  isOpen,
  displayStatus,
  doneCount,
  readOnly,
  isColorLockedByOther,
  colorLockDisplayName,
  showColorPicker,
  renameKey,
  dragHandleProps,
  onPhaseToggle,
  onNameSave,
  onNameEditingChange,
  onMenuRename,
  onColorTriggerClick,
  onColorClose,
  onColorSelect,
  onColorModeSelect,
  onMoveEarlier,
  onMoveLater,
  colorReason,
  displayColor,
  onDeletePhase,
}: PhaseHeaderProps) {
  return (
    <div className="phase-head">
      {dragHandleProps && (
        <span
          className="phase-drag-handle"
          {...(dragHandleProps as React.HTMLAttributes<HTMLSpanElement>)}
          aria-label={`Reorder phase ${phase.name}`}
        >
          <Icon name="grip" size={14} />
        </span>
      )}
      <PhaseNameEditor
        name={phase.name}
        num={phase.num}
        isActive={isActive}
        isOpen={isOpen}
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
          isOnlyPhase={isOnlyPhase}
          readOnly={readOnly}
          isColorLockedByOther={isColorLockedByOther}
          showColorPicker={showColorPicker}
          onRenameClick={onMenuRename}
          onColorTriggerClick={onColorTriggerClick}
          onColorClose={onColorClose}
          onColorSelect={onColorSelect}
          onColorModeSelect={onColorModeSelect}
          onMoveEarlier={onMoveEarlier}
          onMoveLater={onMoveLater}
          colorReason={colorReason}
          displayColor={displayColor}
          onDeletePhase={onDeletePhase}
        />
      )}
    </div>
  )
}
