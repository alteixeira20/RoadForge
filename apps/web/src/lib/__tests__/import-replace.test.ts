import { describe, expect, it, vi } from 'vitest'
import { replaceRoadmapWithCheckpoint } from '@/lib/import-merge/replaceRoadmap'

const checkpoint = {
  created: true,
  version: {
    id: 'rv_1',
    versionNumber: 3,
    createdAt: '2026-07-02T10:00:00Z',
    actorName: 'Editor',
    action: 'roadmap.checkpoint',
    phaseCount: 2,
    taskCount: 8,
  },
}

describe('replaceRoadmapWithCheckpoint', () => {
  it('creates a server checkpoint before applying replacement', async () => {
    const order: string[] = []
    const createCheckpoint = vi.fn(async () => {
      order.push('checkpoint')
      return checkpoint
    })

    await replaceRoadmapWithCheckpoint({
      serverRoadmapId: 'rm_1',
      sessionToken: 'session-token',
      createCheckpoint,
      applyReplacement: () => order.push('replace'),
    })

    expect(createCheckpoint).toHaveBeenCalledWith('rm_1', 'session-token')
    expect(order).toEqual(['checkpoint', 'replace'])
  })

  it('does not replace when server checkpoint creation fails', async () => {
    const applyReplacement = vi.fn()

    await expect(replaceRoadmapWithCheckpoint({
      serverRoadmapId: 'rm_1',
      sessionToken: 'session-token',
      createCheckpoint: vi.fn().mockRejectedValue(new Error('offline')),
      applyReplacement,
    })).rejects.toThrow('offline')

    expect(applyReplacement).not.toHaveBeenCalled()
  })

  it('keeps local replacement independent of server versioning', async () => {
    const createCheckpoint = vi.fn()
    const applyReplacement = vi.fn()

    await replaceRoadmapWithCheckpoint({
      serverRoadmapId: null,
      sessionToken: null,
      createCheckpoint,
      applyReplacement,
    })

    expect(createCheckpoint).not.toHaveBeenCalled()
    expect(applyReplacement).toHaveBeenCalledOnce()
  })
})
