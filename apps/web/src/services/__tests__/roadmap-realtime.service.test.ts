// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getEventTicket,
  subscribeToRoadmapEvents,
} from '@/services/roadmap-realtime.service'
import { requestJson } from '@/services/roadmap-http'

vi.mock('@/services/roadmap-http', () => ({
  API_BASE_URL: 'https://roadforge.test',
  requestJson: vi.fn(),
}))

const mockedRequestJson = vi.mocked(requestJson)

class FakeEventSource {
  static calls: Array<{ url: string; withCredentials: boolean | undefined }> = []

  onopen: ((event: Event) => unknown) | null = null
  onerror: ((event: Event) => unknown) | null = null

  constructor(url: string | URL, init?: EventSourceInit) {
    FakeEventSource.calls.push({
      url: String(url),
      withCredentials: init?.withCredentials,
    })
  }

  addEventListener() {}
  close() {}
}

describe('roadmap realtime bootstrap', () => {
  const OriginalEventSource = globalThis.EventSource

  beforeEach(() => {
    FakeEventSource.calls = []
    mockedRequestJson.mockReset().mockResolvedValue({ expires_in: 30 })
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
  })

  afterEach(() => {
    globalThis.EventSource = OriginalEventSource
  })

  it('bootstraps the HttpOnly event credential with a credentialed POST', async () => {
    await getEventTicket('rm_1', 'sess_secret')

    expect(mockedRequestJson).toHaveBeenCalledWith(
      '/api/roadmaps/rm_1/events/ticket',
      { method: 'POST', credentials: 'include' },
      'sess_secret',
    )
  })

  it('opens EventSource without placing ticket material in the URL', () => {
    const unsubscribe = subscribeToRoadmapEvents('rm_1', {})

    expect(FakeEventSource.calls).toEqual([{
      url: 'https://roadforge.test/api/roadmaps/rm_1/events',
      withCredentials: true,
    }])
    expect(FakeEventSource.calls[0].url).not.toContain('ticket=')
    expect(FakeEventSource.calls[0].url).not.toContain('token=')

    unsubscribe()
  })
})
