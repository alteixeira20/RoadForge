import { describe, it, expect } from 'vitest'
import { COLOR_PRESETS, HEX_COLOR_PATTERN, isValidHexColor } from '@/lib/color'
import { TAG_COLOR_PATTERN } from '@/lib/tag-registry'

describe('color', () => {
  it('accepts well-formed 6-digit hex colors regardless of case', () => {
    expect(isValidHexColor('#a855f7')).toBe(true)
    expect(isValidHexColor('#A855F7')).toBe(true)
    expect(isValidHexColor('  #a855f7  ')).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(isValidHexColor('a855f7')).toBe(false)
    expect(isValidHexColor('#fff')).toBe(false)
    expect(isValidHexColor('#gggggg')).toBe(false)
    expect(isValidHexColor('')).toBe(false)
  })

  it('defines a single, non-empty preset palette', () => {
    expect(COLOR_PRESETS.length).toBeGreaterThan(0)
    for (const preset of COLOR_PRESETS) {
      expect(HEX_COLOR_PATTERN.test(preset.value)).toBe(true)
      expect(preset.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('is the single source of truth for tag color validation', () => {
    expect(TAG_COLOR_PATTERN).toBe(HEX_COLOR_PATTERN)
  })
})
