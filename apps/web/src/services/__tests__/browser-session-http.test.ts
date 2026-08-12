import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BROWSER_SESSION_TOKEN,
  establishBrowserSession,
  requestJson,
  resolveBrowserSessionToken,
} from '@/services/roadmap-http'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('browser session HTTP transport', () => {
  it('uses cookies without serializing the browser-session marker as Bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await requestJson('/api/roadmaps/rm_test', {}, BROWSER_SESSION_TOKEN)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBe('include')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('uses explicit Bearer auth only for the session-to-cookie exchange', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await establishBrowserSession('rm_test', 'raw-session-token')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/roadmaps/rm_test/session/cookie')
    expect(init.credentials).toBe('include')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer raw-session-token',
    )
  })

  it('returns the non-secret marker after a successful exchange', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      resolveBrowserSessionToken('rm_test', 'raw-session-token'),
    ).resolves.toBe(BROWSER_SESSION_TOKEN)
  })

  it('retains the scoped Bearer only when the exchange fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: 'temporary failure' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    ))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(
      resolveBrowserSessionToken('rm_test', 'raw-session-token'),
    ).resolves.toBe('raw-session-token')
  })
})
