'use client'

import React, { useId, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { AnchoredOverlay } from '@/components/ui/AnchoredOverlay'
import { ColorPickerPopover } from '@/components/ui/ColorPickerPopover'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Phase as PhaseType } from '@/types/roadmap'

interface PhaseSettingsMenuProps {
  phase: PhaseType
  isOnlyPhase: boolean
  readOnly: boolean
  isColorLockedByOther: boolean
  showColorPicker: boolean
  onRenameClick: () => void
  onColorTriggerClick: () => void
  onColorClose: () => void
  onColorSelect: (color: string) => void
  onColorModeSelect: (mode: 'auto' | 'manual') => void
  colorReason: string
  displayColor: string
  onDeletePhase: (phaseId: string) => void
}

export function PhaseSettingsMenu({
  phase,
  isOnlyPhase,
  readOnly,
  isColorLockedByOther,
  showColorPicker,
  onRenameClick,
  onColorTriggerClick,
  onColorClose,
  onColorSelect,
  onColorModeSelect,
  colorReason,
  displayColor,
  onDeletePhase,
}: PhaseSettingsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuId = useId()
  const colorDialogId = useId()

  const closeMenu = () => {
    setMenuOpen(false)
  }

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (showColorPicker) onColorTriggerClick()
    const next = !menuOpen
    setMenuOpen(next)
  }

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeMenu()
    onRenameClick()
  }

  const handleColorClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeMenu()
    onColorTriggerClick()
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeMenu()
    queueMicrotask(() => setShowDeleteConfirm(true))
  }

  const topLevelCount = phase.tasks.filter((t) => !t.parentId).length
  const totalCount = phase.tasks.length
  const subCount = totalCount - topLevelCount

  let deleteMsg = `This will remove "${phase.name}"`
  if (totalCount === 0) {
    deleteMsg += '. It has no tasks.'
  } else if (subCount > 0) {
    deleteMsg += ` and its ${topLevelCount} top-level task${topLevelCount === 1 ? '' : 's'} and ${subCount} subtask${subCount === 1 ? '' : 's'}.`
  } else {
    deleteMsg += ` and its ${topLevelCount} task${topLevelCount === 1 ? '' : 's'}.`
  }
  if (isOnlyPhase) {
    deleteMsg += ' This is the final phase. After deletion, use Create first phase to recover the roadmap.'
  }

  return (
    <div className="phase-settings-control">
      <button
        ref={triggerRef}
        type="button"
        className={`phase-settings-trigger${menuOpen ? ' open' : ''}`}
        title="Phase settings"
        aria-label={`Phase settings for ${phase.name}`}
        aria-expanded={menuOpen || showColorPicker}
        aria-haspopup={showColorPicker ? 'dialog' : 'menu'}
        aria-controls={menuOpen ? menuId : showColorPicker ? colorDialogId : undefined}
        onClick={handleTriggerClick}
      >
        <Icon name="more" size={14} />
      </button>

      <AnchoredOverlay
        open={menuOpen && !readOnly && !isColorLockedByOther}
        anchorRef={triggerRef}
        id={menuId}
        role="menu"
        ariaLabel={`Phase settings for ${phase.name}`}
        className="phase-settings-menu"
        onClose={closeMenu}
      >
        <div role="presentation">
          <button type="button" role="menuitem" onClick={handleRenameClick}>
            <Icon name="pencil" size={13} /> Rename
          </button>
          <button type="button" role="menuitem" onClick={handleColorClick}>
            <span className="phase-settings-color-swatch" style={{ backgroundColor: displayColor }} />
            Change color
          </button>
          <div className="phase-settings-sep" role="separator" />
          <button type="button" role="menuitem" className="danger" onClick={handleDeleteClick}>
            <Icon name="trash" size={13} /> Delete phase
          </button>
        </div>
      </AnchoredOverlay>

      <ColorPickerPopover
        open={showColorPicker}
        anchorRef={triggerRef}
        id={colorDialogId}
        ariaLabel={`Color settings for ${phase.name}`}
        value={phase.color}
        onSelect={onColorSelect}
        onClose={onColorClose}
        showPicker={phase.colorMode === 'manual'}
        customLabel="Custom phase hex color"
        header={
          <>
            <div className="phase-color-modes">
              <button
                type="button"
                className={phase.colorMode !== 'manual' ? 'selected' : ''}
                aria-pressed={phase.colorMode !== 'manual'}
                onClick={() => onColorModeSelect('auto')}
              >
                Auto
              </button>
              <button
                type="button"
                className={phase.colorMode === 'manual' ? 'selected' : ''}
                aria-pressed={phase.colorMode === 'manual'}
                onClick={() => onColorModeSelect('manual')}
              >
                Manual
              </button>
            </div>
            {phase.colorMode !== 'manual' && (
              <p className="phase-color-reason">
                <span style={{ backgroundColor: displayColor }} />
                {colorReason}
              </p>
            )}
          </>
        }
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete phase?"
        message={deleteMsg}
        confirmLabel="Delete phase"
        cancelLabel="Keep phase"
        tone="danger"
        onConfirm={() => { setShowDeleteConfirm(false); onDeletePhase(phase.id) }}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
