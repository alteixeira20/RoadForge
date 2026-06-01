import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, isConflictError } from '@/services/roadmap-http'
import { patchTaskDone, patchTaskClaim, deleteTaskClaim } from '@/services/roadmap-crud.service'

const apiRoadmap = {
  id: 'rm_1',
  name: 'Launch',
  owner_display_name: 'Owner',
  schema_version: '1',
  phases: [
    {
      id: 'ph_1',
      num: '01',
      name: 'Phase',
      color: '#f97316',
      status: 'active',
      progress: 100,
      tasks: [{ id: 'tk_1', title: 'Task', done: true }],
    },
  ],
  is_password_enabled: false,
  created_at: '2026-05-29T10:00:00Z',
  updated_at: '2026-05-29T10:01:00Z',
}

describe('patchTaskDone', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('PATCHes the task done endpoint with auth and maps the roadmap response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiRoadmap,
    })
    vi.stubGlobal('fetch', fetchMock)

    const roadmap = await patchTaskDone({
      roadmapId: 'rm_1',
      taskId: 'tk_1',
      done: true,
      sessionToken: 'session-token',
      lastUpdatedAt: '2026-05-29T10:00:00Z',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7878/api/roadmaps/rm_1/tasks/tk_1/done',
      {
        method: 'PATCH',
        body: JSON.stringify({
          done: true,
          last_updated_at: '2026-05-29T10:00:00Z',
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer session-token',
        },
      },
    )
    expect(roadmap.updatedAt).toBe('2026-05-29T10:01:00Z')
    expect(roadmap.phases[0]?.tasks[0]?.done).toBe(true)
  })

  it('preserves 409 conflicts as ApiError instances', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({
        detail: 'Roadmap has changed',
        code: 'roadmap_conflict',
        conflict: {
          roadmap_id: 'rm_1',
          server_updated_at: '2026-05-29T10:02:00Z',
          client_last_updated_at: '2026-05-29T10:00:00Z',
          server: { name: 'Launch', phases: [] },
          summary: null,
        },
      }),
    }))

    await expect(patchTaskDone({
      roadmapId: 'rm_1',
      taskId: 'tk_1',
      done: false,
      sessionToken: 'session-token',
      lastUpdatedAt: '2026-05-29T10:00:00Z',
    })).rejects.toSatisfy((error: unknown) => (
      error instanceof ApiError &&
      isConflictError(error) &&
      error.code === 'roadmap_conflict' &&
      error.conflict?.roadmap_id === 'rm_1'
    ))
  })
})

describe('patchTaskClaim', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('PATCHes the task claim endpoint with auth and no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiRoadmap,
    })
    vi.stubGlobal('fetch', fetchMock)

    const roadmap = await patchTaskClaim({
      roadmapId: 'rm_1',
      taskId: 'tk_1',
      sessionToken: 'session-token',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7878/api/roadmaps/rm_1/tasks/tk_1/claim',
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer session-token' },
      },
    )
    expect(roadmap.updatedAt).toBe('2026-05-29T10:01:00Z')
  })

  it('throws ApiError on 403 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ detail: 'Forbidden' }),
    }))

    await expect(patchTaskClaim({
      roadmapId: 'rm_1',
      taskId: 'tk_1',
      sessionToken: 'viewer-token',
    })).rejects.toBeInstanceOf(ApiError)
  })
})

describe('deleteTaskClaim', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('DELETEs the task claim endpoint with auth and maps the roadmap response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiRoadmap,
    })
    vi.stubGlobal('fetch', fetchMock)

    const roadmap = await deleteTaskClaim({
      roadmapId: 'rm_1',
      taskId: 'tk_1',
      sessionToken: 'session-token',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7878/api/roadmaps/rm_1/tasks/tk_1/claim',
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer session-token' },
      },
    )
    expect(roadmap.updatedAt).toBe('2026-05-29T10:01:00Z')
  })
})
