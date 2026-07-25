import { describe, expect, it, vi } from 'vitest'
import { handleTaskPatchError } from '@/hooks/useTaskPatch'
import { ApiConnectionError, ApiError } from '@/services/roadmap-http'

function handlers() {
  return {
    onConflict: vi.fn(),
    onSessionExpired: vi.fn(),
    showToast: vi.fn(),
  }
}

describe('task patch recovery errors', () => {
  it('preserves the session and draft for permission failures', () => {
    const callbacks = handlers()

    handleTaskPatchError(new ApiError(403, 'Forbidden'), callbacks)

    expect(callbacks.onSessionExpired).not.toHaveBeenCalled()
    expect(callbacks.showToast).toHaveBeenCalledWith(
      expect.stringContaining('do not have permission'),
    )
    expect(callbacks.showToast).toHaveBeenCalledWith(
      expect.stringContaining('draft is preserved'),
    )
  })

  it('expires only unauthorized or explicitly expired sessions', () => {
    const callbacks = handlers()

    handleTaskPatchError(
      new ApiError(401, 'Session expired', 'session_expired'),
      callbacks,
    )

    expect(callbacks.onSessionExpired).toHaveBeenCalledTimes(1)
    expect(callbacks.showToast).not.toHaveBeenCalled()
  })

  it('keeps validation distinct from connectivity', () => {
    const validationCallbacks = handlers()
    handleTaskPatchError(new ApiError(
      422,
      'Validation failed',
      undefined,
      undefined,
      [{ loc: ['body', 'title'], msg: 'Too long', type: 'string_too_long' }],
    ), validationCallbacks)
    expect(validationCallbacks.showToast).toHaveBeenCalledWith(
      expect.stringContaining('Too long'),
    )

    const connectionCallbacks = handlers()
    handleTaskPatchError(new ApiConnectionError(), connectionCallbacks)
    expect(connectionCallbacks.showToast).toHaveBeenCalledWith(
      'Could not reach the server. Your task draft is preserved.',
    )
  })
})
