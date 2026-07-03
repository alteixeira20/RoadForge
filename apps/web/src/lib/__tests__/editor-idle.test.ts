import { describe, expect, it } from 'vitest'
import {
  getIdleDeadline,
  hasEditorBecomeIdle,
  INLINE_EDIT_IDLE_TIMEOUT_MS,
} from '@/lib/editor-idle'

describe('editor idle timing', () => {
  it('uses a 90 second idle window', () => {
    expect(INLINE_EDIT_IDLE_TIMEOUT_MS).toBe(90_000)
    expect(getIdleDeadline(1_000)).toBe(91_000)
  })

  it('pauses at the deadline but not before it', () => {
    expect(hasEditorBecomeIdle(90_999, 1_000)).toBe(false)
    expect(hasEditorBecomeIdle(91_000, 1_000)).toBe(true)
  })

  it('supports an explicit timeout for deterministic callers', () => {
    expect(hasEditorBecomeIdle(1_499, 1_000, 500)).toBe(false)
    expect(hasEditorBecomeIdle(1_500, 1_000, 500)).toBe(true)
  })
})
