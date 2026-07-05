import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, isConflictError } from '@/services/roadmap-http'
import {
  createRoadmapCheckpoint,
  deleteTaskClaim,
  exportRoadmap,
  patchTask,
  patchTaskClaim,
  patchTaskDone,
} from '@/services/roadmap-crud.service'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'
import type { Phase, TagDefinition, Task } from '@/types/roadmap'

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
  it('round-trips every supported task field in a maximal portable fixture', async () => {
    const description = [
      'Opening paragraph with **bold**, *italic*, and `inline code`.',
      '',
      'Second paragraph with a [RoadForge link](https://example.com/roadforge).',
      '',
      '- First bullet',
      '- Second bullet',
      '',
      '1. First numbered item',
      '2. Second numbered item',
      '',
      '- [x] Completed check',
      '- [ ] Pending check',
    ].join('\n')
    const maximalTask = {
      id: 'RF-3',
      title: 'Intentionally maximal subtask',
      done: false,
      next: true,
      est: '3d',
      assignees: ['Alex', 'Sam'],
      tags: ['delivery', 'frontend'],
      deps: ['RF-1'],
      desc: description,
      parentId: 'RF-2',
      claimedBy: 'Alex',
      claimedById: 'pt_alex',
      claimedAt: '2026-07-03T09:00:00.000Z',
      links: [
        {
          id: 'link-rf-3-issue',
          provider: 'github',
          kind: 'issue',
          url: 'https://github.com/anvilary/roadforge/issues/601',
          owner: 'anvilary',
          repo: 'roadforge',
          number: 601,
          label: 'Foundation issue',
        },
        {
          id: 'link-rf-3-spec',
          provider: 'url',
          kind: 'url',
          url: 'https://example.com/spec',
          label: 'External specification',
        },
      ],
    } satisfies Required<Task>
    const phases: Phase[] = [
      {
        id: 'phase-1',
        num: '01',
        name: 'Discovery',
        color: '#f97316',
        colorMode: 'manual',
        status: 'done',
        progress: 100,
        tasks: [{
          id: 'RF-1',
          title: 'Completed dependency',
          done: true,
          next: false,
          tags: ['planning'],
          assignees: [],
          deps: [],
        }],
      },
      {
        id: 'phase-2',
        num: '02',
        name: 'Implementation',
        color: '#38bdf8',
        colorMode: 'auto',
        status: 'active',
        progress: 0,
        tasks: [
          {
            id: 'RF-2',
            title: 'Parent task',
            done: false,
            next: false,
            est: '5d',
            tags: ['delivery'],
            assignees: [],
            deps: [],
          },
          maximalTask,
        ],
      },
    ]
    const tagRegistry: TagDefinition[] = [
      { id: 'planning', label: 'Planning', color: '#f97316' },
      { id: 'delivery', label: 'Delivery', color: '#38bdf8' },
      { id: 'frontend', label: 'Frontend', color: '#a78bfa' },
    ]

    const blob = await exportRoadmap(phases, 'json', {
      roadmapName: 'Public Alpha Compatibility',
      tagRegistry,
    })
    const exported = JSON.parse(await blob.text()) as { schema: string }
    const imported = parseImportedRoadmapJson(JSON.stringify(exported))
    const importedMaximalTask = imported.phases[1].tasks[1]

    expect(exported.schema).toBe('anvilary.roadmap.export')
    expect(imported.roadmapName).toBe('Public Alpha Compatibility')
    expect(imported.phases).toEqual(phases)
    expect(Object.keys(importedMaximalTask).sort())
      .toEqual(Object.keys(maximalTask).sort())
    expect(importedMaximalTask).toEqual(maximalTask)
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

describe('patchTask', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('PATCHes only provided task fields with the mapped concurrency timestamp', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiRoadmap,
    })
    vi.stubGlobal('fetch', fetchMock)

    const roadmap = await patchTask({
      roadmapId: 'rm_1',
      taskId: 'tk_1',
      updates: {
        est: '2d',
        assignees: ['Alex'],
        tags: ['frontend'],
      },
      sessionToken: 'session-token',
      lastUpdatedAt: '2026-05-29T10:00:00Z',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7878/api/roadmaps/rm_1/tasks/tk_1',
      {
        method: 'PATCH',
        body: JSON.stringify({
          est: '2d',
          assignees: ['Alex'],
          tags: ['frontend'],
          last_updated_at: '2026-05-29T10:00:00Z',
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer session-token',
        },
      },
    )
    expect(roadmap.updatedAt).toBe('2026-05-29T10:01:00Z')
  })

  it('preserves structured conflicts for the shared conflict handler', async () => {
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

    await expect(patchTask({
      roadmapId: 'rm_1',
      taskId: 'tk_1',
      updates: { title: 'Preserved draft' },
      sessionToken: 'session-token',
      lastUpdatedAt: '2026-05-29T10:00:00Z',
    })).rejects.toSatisfy((error: unknown) => (
      error instanceof ApiError
      && isConflictError(error)
      && error.conflict?.client_last_updated_at === '2026-05-29T10:00:00Z'
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
