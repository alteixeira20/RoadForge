'use client'

import { useEffect, useId, useState, type ReactNode, type RefObject } from 'react'
import { AnchoredOverlay } from '@/components/ui/AnchoredOverlay'
import { COLOR_PRESETS, isValidHexColor, type ColorPreset } from '@/lib/color'

interface ColorPickerPopoverProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  id?: string
  ariaLabel: string
  value: string
  onSelect: (color: string) => void
  onClose: () => void
  presets?: ColorPreset[]
  customLabel?: string
  customPlaceholder?: string
  /** When false, only `header` renders — used for phase Auto mode. */
  showPicker?: boolean
  header?: ReactNode
}

export function ColorPickerPopover({
  open,
  anchorRef,
  id,
  ariaLabel,
  value,
  onSelect,
  onClose,
  presets = COLOR_PRESETS,
  customLabel = 'Custom hex color',
  customPlaceholder = '#a855f7',
  showPicker = true,
  header,
}: ColorPickerPopoverProps) {
  const [customColor, setCustomColor] = useState(value)
  const hintId = useId()
  const customColorValid = isValidHexColor(customColor)
  const showInvalidHint = customColor.trim().length > 0 && !customColorValid

  useEffect(() => {
    if (open) setCustomColor(value)
  }, [value, open])

  return (
    <AnchoredOverlay
      open={open}
      anchorRef={anchorRef}
      id={id}
      role="dialog"
      ariaLabel={ariaLabel}
      className="color-picker-popover"
      onClose={onClose}
    >
      <div>
        {header}
        {showPicker && (
          <>
            <div className="color-picker-presets" role="group" aria-label="Preset colors">
              {presets.map((preset) => {
                const selected = preset.value.toLowerCase() === value.toLowerCase()
                return (
                  <button
                    key={preset.value}
                    type="button"
                    className={selected ? 'selected' : ''}
                    title={preset.label}
                    aria-label={preset.label}
                    aria-pressed={selected}
                    onClick={() => onSelect(preset.value)}
                  >
                    <span style={{ backgroundColor: preset.value }} />
                  </button>
                )
              })}
            </div>
            <div className="color-picker-custom">
              <input
                value={customColor}
                aria-label={customLabel}
                aria-invalid={showInvalidHint}
                aria-describedby={showInvalidHint ? hintId : undefined}
                onChange={(event) => setCustomColor(event.target.value)}
                placeholder={customPlaceholder}
              />
              <button
                type="button"
                disabled={!customColorValid}
                onClick={() => onSelect(customColor.trim().toLowerCase())}
              >
                Apply
              </button>
            </div>
            {showInvalidHint && (
              <p className="color-picker-hint" id={hintId} role="status">
                Enter a 6-digit hex color, like #a855f7.
              </p>
            )}
          </>
        )}
      </div>
    </AnchoredOverlay>
  )
}
