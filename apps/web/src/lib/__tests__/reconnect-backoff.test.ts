import { describe, expect, it } from 'vitest'
import { computeReconnectDelayMs, MAX_RECONNECT_DELAY_MS } from '@/lib/reconnect-backoff'

describe('computeReconnectDelayMs', () => {
  it('grows exponentially with the attempt number', () => {
    // Full jitter over the top half of each ceiling: [ceiling/2, ceiling].
    expect(computeReconnectDelayMs(0, () => 0)).toBe(500)
    expect(computeReconnectDelayMs(0, () => 1)).toBe(1_000)
    expect(computeReconnectDelayMs(1, () => 0)).toBe(1_000)
    expect(computeReconnectDelayMs(1, () => 1)).toBe(2_000)
    expect(computeReconnectDelayMs(2, () => 0)).toBe(2_000)
    expect(computeReconnectDelayMs(2, () => 1)).toBe(4_000)
  })

  it('bounds jitter within [ceiling/2, ceiling] for a mid-range random value', () => {
    const delay = computeReconnectDelayMs(3, () => 0.5)
    // ceiling = 8000, floor = 4000, expected = 4000 + 0.5 * 4000 = 6000
    expect(delay).toBe(6_000)
  })

  it('caps the delay at MAX_RECONNECT_DELAY_MS regardless of how high the attempt goes', () => {
    expect(computeReconnectDelayMs(10, () => 1)).toBe(MAX_RECONNECT_DELAY_MS)
    expect(computeReconnectDelayMs(100, () => 1)).toBe(MAX_RECONNECT_DELAY_MS)
    expect(computeReconnectDelayMs(10, () => 0)).toBe(MAX_RECONNECT_DELAY_MS / 2)
  })

  it('never returns a delay below half the capped ceiling', () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const delay = computeReconnectDelayMs(attempt, () => 0)
      const ceiling = Math.min(1_000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS)
      expect(delay).toBe(ceiling / 2)
    }
  })

  it('treats negative attempts as attempt 0', () => {
    expect(computeReconnectDelayMs(-5, () => 0)).toBe(500)
  })
})
