'use client'

import { forwardRef, type MouseEvent } from 'react'

interface ColorSwatchButtonProps {
  color: string
  label: string
  expanded?: boolean
  controls?: string
  className?: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}

export const ColorSwatchButton = forwardRef<HTMLButtonElement, ColorSwatchButtonProps>(
  function ColorSwatchButton({ color, label, expanded, controls, className, onClick }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={`color-swatch-button${className ? ` ${className}` : ''}`}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={controls}
        onClick={onClick}
      >
        <span
          className="color-swatch-button-dot"
          aria-hidden="true"
          style={{ backgroundColor: color }}
        />
      </button>
    )
  },
)
