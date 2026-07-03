export const INLINE_EDIT_IDLE_TIMEOUT_MS = 90_000

export function getIdleDeadline(
  lastInteractionAt: number,
  timeoutMs: number = INLINE_EDIT_IDLE_TIMEOUT_MS,
): number {
  return lastInteractionAt + timeoutMs
}

export function hasEditorBecomeIdle(
  now: number,
  lastInteractionAt: number,
  timeoutMs: number = INLINE_EDIT_IDLE_TIMEOUT_MS,
): boolean {
  return now >= getIdleDeadline(lastInteractionAt, timeoutMs)
}
