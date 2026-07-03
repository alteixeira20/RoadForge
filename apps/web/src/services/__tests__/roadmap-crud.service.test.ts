import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, isConflictError } from '@/services/roadmap-http'
import {
  createRoadmapCheckpoint,
  deleteTaskClaim,
  exportRoadmap,
  patchTaskClaim,
  patchTaskDone,
} from '@/services/roadmap-crud.service'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'
import type { Phase, TagDefinition } from '@/types/roadmap'

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

describe('exportRoadmap', () => {
  it('round-trips the complete portable roadmap shape without warnings or repairs', async () => {
    const phases: Phase[] = [{
      id: 'phase-1',
      num: '01',
      name: 'Implementation',
      color: '#f97316',
      colorMode: 'manual',
      status: 'active',
      progress: 50,
      tasks: [
        {
          id: 'RF-1',
          title: 'Parent task',
          done: true,
          next: false,
          est: '2d',
          tags: ['planning'],
          assignees: ['Alex'],
          deps: [],
          desc: 'Intro with **bold**.\\n\\n- [x] Complete\\n- [ ] Follow up',
          claimedBy: 'Alex',
          claimedById: 'pt_alex',
          claimedAt: '2026-07-03T09:00:00.000Z',
        },
        {
          id: 'RF-2',
          title: 'Nested task',
          done: false,
          next: true,
          est: '1d',
          tags: ['delivery'],
          assignees: ['Sam'],
          deps: ['RF-1'],
          desc: 'See [context](https://example.com) and use `pnpm test`.',
          parentId: 'RF-1',
        },
      ],
    }]
    const tagRegistry: TagDefinition[] = [
      { id: 'planning', label: 'Planning', color: '#f97316' },
      { id: 'delivery', label: 'Delivery', color: '#38bdf8' },
    ]

    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Round-trip',
      tagRegistry,
    })
    const exported = JSON.parse(await blob.text()) as { schema: string }
    const imported = parseImportedRoadmapJson(JSON.stringify(exported))

    expect(exported.schema).toBe('anvilary.roadmap.export')
    expect(imported.phases).toEqual(phases)
    expect(imported.tagRegistry).toEqual(tagRegistry)
    expect(imported.warnings).toEqual([])
    expect(imported.repairs).toEqual([])
  })
})

describe('createRoadmapCheckpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('POSTs the checkpoint endpoint with auth and maps the version', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        created: true,
        version: {
          id: 'rv_1',
          version_number: 4,
          created_at: '2026-07-02T10:00:00Z',
          actor_name: 'Editor',
          action: 'roadmap.checkpoint',
          phase_count: 2,
          task_count: 8,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createRoadmapCheckpoint('rm_1', 'editor-token')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7878/api/roadmaps/rm_1/versions/checkpoint',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer editor-token' },
      },
    )
    expect(result).toMatchObject({
      created: true,
      version: { id: 'rv_1', versionNumber: 4, phaseCount: 2, taskCount: 8 },
    })
  })
})

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

  it('adds an explicit override query for owner takeover', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiRoadmap,
    })
    vi.stubGlobal('fetch', fetchMock)

    await patchTaskClaim({
      roadmapId: 'rm_1',
      taskId: 'tk_1',
      sessionToken: 'owner-token',
      override: true,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7878/api/roadmaps/rm_1/tasks/tk_1/claim?override=true',
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer owner-token' },
      },
    )
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

  it('adds an explicit override query for owner clearing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiRoadmap,
    })
    vi.stubGlobal('fetch', fetchMock)

    await deleteTaskClaim({
      roadmapId: 'rm_1',
      taskId: 'tk_1',
      sessionToken: 'owner-token',
      override: true,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7878/api/roadmaps/rm_1/tasks/tk_1/claim?override=true',
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer owner-token' },
      },
    )
  })
})
