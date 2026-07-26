// Exponential backoff with jitter for SSE reconnect attempts (RF-048).
// Pure and deterministic given an injected `random`, so delay progression,
// jitter bounds, and the max-delay cap can be tested without fake timers.

const BASE_DELAY_MS = 1_000
export const MAX_RECONNECT_DELAY_MS = 30_000

/**
 * `attempt` is 0-based (first retry = attempt 0). Returns a delay in
 * [ceiling/2, ceiling], where ceiling = min(BASE * 2^attempt, MAX) — full
 * jitter over the lower half of the range, so the delay never collapses to
 * near-zero at high attempt counts while still varying attempt-to-attempt.
 */
export function computeReconnectDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const safeAttempt = Math.max(0, attempt)
  const ceiling = Math.min(BASE_DELAY_MS * 2 ** safeAttempt, MAX_RECONNECT_DELAY_MS)
  const floor = ceiling / 2
  return floor + random() * (ceiling - floor)
}
