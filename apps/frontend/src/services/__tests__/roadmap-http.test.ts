import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiConnectionError, ApiError, requestJson } from '@/services/roadmap-http'

describe('requestJson', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('parses a FastAPI array-shaped 422 detail onto the thrown ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({
        detail: [
          {
            loc: ['body', 'phases', 0, 'tasks', 0, 'done'],
            msg: 'Input should be a valid boolean',
            type: 'bool_type',
          },
        ],
      }),
    }))

    await expect(requestJson('/api/roadmaps/rm_1', { method: 'PUT' })).rejects.toSatisfy(
      (error: unknown) => (
        error instanceof ApiError &&
        error.status === 422 &&
        error.validationErrors?.length === 1 &&
        error.validationErrors[0].loc.join('.') === 'body.phases.0.tasks.0.done' &&
        error.validationErrors[0].msg === 'Input should be a valid boolean'
      ),
    )
  })

  it('throws ApiConnectionError, not ApiError, on a genuine fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(requestJson('/api/roadmaps/rm_1')).rejects.toBeInstanceOf(ApiConnectionError)
  })
})
