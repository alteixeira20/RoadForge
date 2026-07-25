'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { AnchoredOverlay } from '@/components/ui/AnchoredOverlay'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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
  const [customColor, setCustomColor] = useState(phase.color)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuId = useId()
  const colorDialogId = useId()
  const customColorValid = /^#[0-9a-f]{6}$/i.test(customColor)

  const closeMenu = () => {
    setMenuOpen(false)
  }

  useEffect(() => {
    setCustomColor(phase.color)
  }, [phase.color, phase.id])

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

      <AnchoredOverlay
        open={showColorPicker}
        anchorRef={triggerRef}
        id={colorDialogId}
        role="dialog"
        ariaLabel={`Color settings for ${phase.name}`}
        className="phase-color-popover"
        onClose={onColorClose}
      >
        <div>
          <div className="phase-color-modes">
            <button
              type="button"
              className={phase.colorMode !== 'manual' ? 'selected' : ''}
              onClick={() => onColorModeSelect('auto')}
            >
              Auto
            </button>
            <button
              type="button"
              className={phase.colorMode === 'manual' ? 'selected' : ''}
              onClick={() => onColorModeSelect('manual')}
            >
              Manual
            </button>
          </div>
          {phase.colorMode !== 'manual' ? (
            <p className="phase-color-reason">
              <span style={{ backgroundColor: displayColor }} />
              {colorReason}
            </p>
          ) : (
            <>
              <div className="phase-color-presets">
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
              <div className="phase-custom-color">
                <input
                  value={customColor}
                  aria-label="Custom phase hex color"
                  onChange={(event) => setCustomColor(event.target.value)}
                  placeholder="#a855f7"
                />
                <button
                  type="button"
                  disabled={!customColorValid}
                  onClick={() => onColorSelect(customColor.toLowerCase())}
                >
                  Apply
                </button>
              </div>
            </>
          )}
        </div>
      </AnchoredOverlay>

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
