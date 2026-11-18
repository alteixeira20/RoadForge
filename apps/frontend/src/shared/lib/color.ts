export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value.trim())
}

export interface ColorPreset {
  label: string
  value: string
}

export const COLOR_PRESETS: ColorPreset[] = [
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
