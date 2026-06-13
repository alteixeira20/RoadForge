'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
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
  readOnly: boolean
  isColorLockedByOther: boolean
  showColorPicker: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  onRenameClick: () => void
  onColorTriggerClick: () => void
  onColorSelect: (color: string) => void
  onColorModeSelect: (mode: 'auto' | 'manual') => void
  colorReason: string
  displayColor: string
  onDeletePhase: (phaseId: string) => void
  onMenuOpenChange?: (open: boolean) => void
}

export function PhaseSettingsMenu({
  phase,
  readOnly,
  isColorLockedByOther,
  showColorPicker,
  containerRef,
  onRenameClick,
  onColorTriggerClick,
  onColorSelect,
  onColorModeSelect,
  colorReason,
  displayColor,
  onDeletePhase,
  onMenuOpenChange,
}: PhaseSettingsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [customColor, setCustomColor] = useState(phase.color)
  const customColorValid = /^#[0-9a-f]{6}$/i.test(customColor)

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    onMenuOpenChange?.(false)
  }, [onMenuOpenChange])

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && containerRef.current?.contains(e.target as Node)) return
      closeMenu()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [menuOpen, containerRef, closeMenu])

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (showColorPicker) onColorTriggerClick()
    const next = !menuOpen
    setMenuOpen(next)
    onMenuOpenChange?.(next)
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
    setShowDeleteConfirm(true)
  }

  const topLevelCount = phase.tasks.filter((t) => !t.parentId).length
  const totalCount = phase.tasks.length
  const subCount = totalCount - topLevelCount

  let deleteMsg = `This will remove "${phase.name}"`
  if (topLevelCount === 0) {
    deleteMsg += '. It has no tasks.'
  } else if (subCount > 0) {
    deleteMsg += ` and all ${topLevelCount} task${topLevelCount === 1 ? '' : 's'} (${totalCount} total with subtasks) inside it.`
  } else {
    deleteMsg += ` and all ${topLevelCount} task${topLevelCount === 1 ? '' : 's'} inside it.`
  }

  return (
    <div ref={containerRef} className="phase-settings-control">
      <button
        type="button"
        className={`phase-settings-trigger${menuOpen ? ' open' : ''}`}
        title="Phase settings"
        aria-label={`Phase settings for ${phase.name}`}
        aria-expanded={menuOpen}
        onClick={handleTriggerClick}
      >
        <Icon name="more" size={14} />
      </button>

      {menuOpen && !readOnly && !isColorLockedByOther && (
        <div className="phase-settings-menu" role="menu">
          <button role="menuitem" onClick={handleRenameClick}>
            <Icon name="pencil" size={13} /> Rename
          </button>
          <button role="menuitem" onClick={handleColorClick}>
            <span className="phase-settings-color-swatch" style={{ backgroundColor: displayColor }} />
            Change color
          </button>
          <div className="phase-settings-sep" role="separator" />
          <button role="menuitem" className="danger" onClick={handleDeleteClick}>
            <Icon name="trash" size={13} /> Delete phase
          </button>
        </div>
      )}

      {showColorPicker && (
        <div className="phase-color-popover" aria-label="Phase color settings">
          <div className="phase-color-modes">
            <button
              type="button"
              className={phase.colorMode === 'auto' ? 'selected' : ''}
              onClick={() => onColorModeSelect('auto')}
            >
              Auto
            </button>
            <button
              type="button"
              className={phase.colorMode !== 'auto' ? 'selected' : ''}
              onClick={() => onColorModeSelect('manual')}
            >
              Manual
            </button>
          </div>
          {phase.colorMode === 'auto' ? (
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
      )}

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
