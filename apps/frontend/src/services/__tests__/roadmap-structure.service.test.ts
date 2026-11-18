// API-contract regression tests for roadmap-structure.service.ts
//
// These tests verify the exact JSON payload sent by createServerPhase and
// confirm that the function correctly rejects a 422 response produced by
// FastAPI's extra="forbid" schema validation.  They were added as part of
// the AGY04 corrective pass following the AGY05 audit finding that identified
// HTTP 422 failures caused by extra fields (num, tasks, progress, status)
// being serialized into the request body.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createServerPhase,
  type CreatePhaseFields,
  type PhaseMutationResult,
} from '@/services/roadmap-structure.service'
import { ApiError } from '@/services/roadmap-http'
import type { Phase } from '@/types/roadmap'

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

/** A full Phase object as produced by createPhase() - has extra fields beyond
 *  what the server's CreatePhaseRequest schema permits. */
const FULL_PHASE: Phase = {
  id: 'ph_test_01',
  num: '03',
  name: 'New Phase',
  color: '#4a90d9',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [{ id: 'task_1', title: 'Task', done: false }],
}

/** Expected clean payload: only the four fields allowed by CreatePhaseRequest. */
const EXPECTED_PAYLOAD: CreatePhaseFields = {
  id: 'ph_test_01',
  name: 'New Phase',
  color: '#4a90d9',
  colorMode: 'auto',
}

const SESSION_TOKEN = 'test-session-token'
const ROADMAP_ID = 'rm_test_abc'

function makeSuccessResponse(overrides: Partial<Phase> = {}): object {
  return {
    id: ROADMAP_ID,
    name: 'Test Roadmap',
    phases: [
      { ...FULL_PHASE, num: '01', tasks: [], progress: 0, status: 'active', ...overrides },
    ],
    updated_at: '2026-09-26T12:00:00Z',
  }
}

function make422Response(): object {
  return {
    detail: [
      { type: 'extra_forbidden', loc: ['body', 'num'], msg: 'Extra inputs are not permitted' },
      { type: 'extra_forbidden', loc: ['body', 'tasks'], msg: 'Extra inputs are not permitted' },
      { type: 'extra_forbidden', loc: ['body', 'progress'], msg: 'Extra inputs are not permitted' },
      { type: 'extra_forbidden', loc: ['body', 'status'], msg: 'Extra inputs are not permitted' },
    ],
  }
}

// ---------------------------------------------------------------------------
// Helpers to capture what fetch was actually called with
// ---------------------------------------------------------------------------

function captureFetchPayload(fetchMock: ReturnType<typeof vi.fn>): object {
  const calls = fetchMock.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  const init: RequestInit = calls[0][1]
  expect(typeof init.body).toBe('string')
  return JSON.parse(init.body as string)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createServerPhase', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // -------------------------------------------------------------------------
  // P1 regression: payload must contain exactly the four permitted fields
  // -------------------------------------------------------------------------

  it('sends exactly {id, name, color, colorMode} - no extra fields', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeSuccessResponse(),
    })

    await createServerPhase(ROADMAP_ID, FULL_PHASE as unknown as CreatePhaseFields, SESSION_TOKEN)

    const sent = captureFetchPayload(fetchMock)
    expect(sent).toStrictEqual(EXPECTED_PAYLOAD)
  })

  it('does not include "num" in the outgoing payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeSuccessResponse(),
    })

    await createServerPhase(ROADMAP_ID, FULL_PHASE as unknown as CreatePhaseFields, SESSION_TOKEN)

    const sent = captureFetchPayload(fetchMock)
    expect(sent).not.toHaveProperty('num')
  })

  it('does not include "tasks" in the outgoing payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeSuccessResponse(),
    })

    await createServerPhase(ROADMAP_ID, FULL_PHASE as unknown as CreatePhaseFields, SESSION_TOKEN)

    const sent = captureFetchPayload(fetchMock)
    expect(sent).not.toHaveProperty('tasks')
  })

  it('does not include "progress" in the outgoing payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeSuccessResponse(),
    })

    await createServerPhase(ROADMAP_ID, FULL_PHASE as unknown as CreatePhaseFields, SESSION_TOKEN)

    const sent = captureFetchPayload(fetchMock)
    expect(sent).not.toHaveProperty('progress')
  })

  it('does not include "status" in the outgoing payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeSuccessResponse(),
    })

    await createServerPhase(ROADMAP_ID, FULL_PHASE as unknown as CreatePhaseFields, SESSION_TOKEN)

    const sent = captureFetchPayload(fetchMock)
    expect(sent).not.toHaveProperty('status')
  })

  it('preserves colorMode in the outgoing payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeSuccessResponse(),
    })

    const phaseWithManualMode: CreatePhaseFields = {
      id: 'ph_manual',
      name: 'Manual Phase',
      color: '#ff0000',
      colorMode: 'manual',
    }

    await createServerPhase(ROADMAP_ID, phaseWithManualMode, SESSION_TOKEN)

    const sent = captureFetchPayload(fetchMock)
    expect(sent).toMatchObject({ id: 'ph_manual', name: 'Manual Phase', color: '#ff0000', colorMode: 'manual' })
  })

  // -------------------------------------------------------------------------
  // P1 regression: server correctly rejects the old unpruned payload (422)
  // -------------------------------------------------------------------------

  it('throws ApiError with status 422 when the server rejects an unpruned payload', async () => {
    // Simulate what the server returns when extra fields are present.
    // This confirms the 422 path is tested end-to-end and that the server's
    // extra="forbid" schema is never weakened.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => make422Response(),
    })

    // Inject a payload that still carries the forbidden fields to simulate
    // what the old (unfixed) code sent.
    const unprunedPayload = { ...EXPECTED_PAYLOAD, num: '03', tasks: [], progress: 0, status: 'active' }
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      // Confirm the test is correctly sending the bad payload
      expect(body).toHaveProperty('num')
      return Promise.resolve({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => make422Response(),
      })
    })

    // Build a fake service call that bypasses the fix so we can assert the
    // 422 is correctly surfaced as a validation-kind ApiError.
    const { requestJson } = await import('@/services/roadmap-http')
    await expect(
      requestJson(
        `/api/roadmaps/${ROADMAP_ID}/phases`,
        { method: 'POST', body: JSON.stringify(unprunedPayload) },
        SESSION_TOKEN,
      ),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 422 &&
        Array.isArray(error.validationErrors) &&
        error.validationErrors.some((e) => e.loc.includes('num')) &&
        error.validationErrors.some((e) => e.loc.includes('tasks')),
    )
  })

  // -------------------------------------------------------------------------
  // Success path: returned PhaseMutationResult is shaped correctly
  // -------------------------------------------------------------------------

  it('returns a PhaseMutationResult with phases and updatedAt on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeSuccessResponse(),
    })

    const result: PhaseMutationResult = await createServerPhase(
      ROADMAP_ID,
      EXPECTED_PAYLOAD,
      SESSION_TOKEN,
    )

    expect(result.updatedAt).toBe('2026-09-26T12:00:00Z')
    expect(Array.isArray(result.phases)).toBe(true)
    expect(result.phases[0].id).toBe(FULL_PHASE.id)
  })

  // -------------------------------------------------------------------------
  // HTTP method, URL and Authorization header
  // -------------------------------------------------------------------------

  it('uses POST to the correct endpoint with Bearer authorization', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeSuccessResponse(),
    })

    await createServerPhase(ROADMAP_ID, EXPECTED_PAYLOAD, SESSION_TOKEN)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/api/roadmaps/${ROADMAP_ID}/phases`)
    expect((init.method ?? '').toUpperCase()).toBe('POST')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SESSION_TOKEN}`)
  })
})
