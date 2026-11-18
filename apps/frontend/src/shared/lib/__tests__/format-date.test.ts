import { expect, it } from 'vitest'
import { formatShortDateTime } from '../format-date'

it('formats in the current locale with short date and minute precision', () => {
  const value = '2026-11-18T12:15:30Z'
  expect(formatShortDateTime(value)).toBe(new Date(value).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }))
})

it('uses the requested fallback for an absent date', () => {
  expect(formatShortDateTime(undefined)).toBe('Never')
  expect(formatShortDateTime(null, 'not set')).toBe('not set')
})
