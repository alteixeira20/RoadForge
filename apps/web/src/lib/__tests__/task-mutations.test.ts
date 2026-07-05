import { describe, expect, it, vi } from 'vitest'
import { createTaskMutations } from '@/hooks/useTaskMutations'
import type { ActivityChange, Phase } from '@/types/roadmap'

const phases: Phase[] = [{
  id: 'phase-1',
  num: '01',
  name: 'Build',
  color: '#f97316',
  status: 'active',
  progress: 0,
  tasks: [{
    id: 'RF-303',
    title: 'Original title',
    desc: 'Original description',
    est: '1d',
    assignees: ['Alex'],
    tags: ['frontend'],
    links: [{
      id: 'existing-link',
      provider: 'github',
      kind: 'issue',
      url: 'https://github.com/anvilary/roadforge/issues/303',
      owner: 'anvilary',
      repo: 'roadforge',
      number: 303,
    }],
    done: false,
  }],
}]

function createParams(overrides: Record<string, unknown> = {}) {
  return {
    phases,
    setPhases: vi.fn(),
    setSaved: vi.fn(),
    serverRoadmapId: null,
    sessionToken: null,
    updatedAt: null,
    addActivity: vi.fn<(change: ActivityChange) => void>(),
    showToast: vi.fn(),
    setExpandedTaskId: vi.fn(),
    readOnly: false,
    isTaskDonePatchInFlight: vi.fn(() => false),
    patchSyncedTaskDone: vi.fn(async () => true),
    patchSyncedTask: vi.fn(async () => true),
    ...overrides,
  }
}

describe('createTaskMutations task updates', () => {
  it('keeps local title commits on the local dirty/activity path', async () => {
    const params = createParams()
    const mutations = createTaskMutations(params)

    await expect(mutations.handleUpdateTask('RF-303', {
      title: 'Local title',
    })).resolves.toBe(true)

    expect(params.patchSyncedTask).not.toHaveBeenCalled()
    expect(params.setPhases).toHaveBeenCalledOnce()
    expect(params.addActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: 'task.updated',
      changedFields: ['title'],
    }))
    expect(params.setSaved).toHaveBeenCalledWith(false)
  })

  it('routes a synced title commit through the focused patch path only', async () => {
    const params = createParams({
      serverRoadmapId: 'rm_1',
      sessionToken: 'session-token',
      updatedAt: '2026-07-04T10:00:00Z',
    })
    const mutations = createTaskMutations(params)

    await expect(mutations.handleUpdateTask('RF-303', {
      title: 'Synced title',
    })).resolves.toBe(true)

    expect(params.patchSyncedTask).toHaveBeenCalledWith({
      task: phases[0].tasks[0],
      updates: { title: 'Synced title' },
    })
    expect(params.setPhases).not.toHaveBeenCalled()
    expect(params.setSaved).not.toHaveBeenCalled()
    expect(params.addActivity).not.toHaveBeenCalled()
  })

  it('updates local links without changing unrelated task fields', async () => {
    const params = createParams()
    const mutations = createTaskMutations(params)
    const links = [
      ...(phases[0].tasks[0].links ?? []),
      {
        id: 'new-link',
        provider: 'github' as const,
        kind: 'pull' as const,
        url: 'https://github.com/anvilary/roadforge/pull/604',
        owner: 'anvilary',
        repo: 'roadforge',
        number: 604,
      },
    ]

    await expect(mutations.handleUpdateTask('RF-303', { links })).resolves.toBe(true)

    const nextPhases = params.setPhases.mock.calls[0][0]
    expect(nextPhases[0].tasks[0]).toEqual({
      ...phases[0].tasks[0],
      links,
    })
    expect(params.setSaved).toHaveBeenCalledWith(false)
  })

  it('routes synced links through task PATCH', async () => {
    const params = createParams({
      serverRoadmapId: 'rm_1',
      sessionToken: 'session-token',
      updatedAt: '2026-07-04T10:00:00Z',
    })
    const mutations = createTaskMutations(params)
    const links = [{
      id: 'new-link',
      provider: 'github' as const,
      kind: 'discussion' as const,
      url: 'https://github.com/anvilary/roadforge/discussions/604',
      owner: 'anvilary',
      repo: 'roadforge',
      number: 604,
    }]

    await expect(mutations.handleUpdateTask('RF-303', { links })).resolves.toBe(true)

    expect(params.patchSyncedTask).toHaveBeenCalledWith({
      task: phases[0].tasks[0],
      updates: { links },
    })
    expect(params.setPhases).not.toHaveBeenCalled()
  })

  it('does not patch or dirty a no-op Edit details save', async () => {
    const params = createParams({
      serverRoadmapId: 'rm_1',
      sessionToken: 'session-token',
      updatedAt: '2026-07-04T10:00:00Z',
    })
    const mutations = createTaskMutations(params)

    await expect(mutations.handleUpdateTask('RF-303', {
      title: 'Original title',
      desc: 'Original description',
      est: '1d',
      assignees: ['Alex'],
      tags: ['frontend'],
    })).resolves.toBe(true)

    expect(params.patchSyncedTask).not.toHaveBeenCalled()
    expect(params.setPhases).not.toHaveBeenCalled()
    expect(params.setSaved).not.toHaveBeenCalled()
    expect(params.addActivity).not.toHaveBeenCalled()
  })
})
