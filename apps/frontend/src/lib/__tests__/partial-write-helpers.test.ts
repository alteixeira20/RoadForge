import { describe, expect, it, vi } from 'vitest'
import {
  applyPartialWriteResult,
  mergeReturnedTaskFields,
} from '@/hooks/partialWriteHelpers'
import type { Phase, Roadmap, TagDefinition } from '@/types/roadmap'

const localPhases: Phase[] = [{
  id: 'phase-1',
  num: '01',
  name: 'Local phase name',
  color: '#f97316',
  status: 'active',
  progress: 0,
  tasks: [{
    id: 'RF-303',
    title: 'Local title',
    desc: 'Local description',
    done: false,
  }],
}]

const returnedRoadmap: Roadmap = {
  project: { id: 'rm_1', name: 'Roadmap' },
  roadmap: { id: 'rm_1', name: 'Roadmap' },
  phases: [{
    ...localPhases[0],
    name: 'Server phase name',
    tasks: [{
      id: 'RF-303',
      title: 'Server title',
      done: false,
    }],
  }],
  tagRegistry: [{ id: 'frontend', label: 'Frontend' }],
  ownerDisplayName: 'Owner',
  updatedAt: '2026-07-04T10:01:00Z',
}

describe('partial write response helpers', () => {
  it('applies the complete returned state when the client stayed clean', () => {
    const setPhases = vi.fn()
    const setTagRegistry = vi.fn<(registry: TagDefinition[]) => void>()
    const setUpdatedAt = vi.fn()
    const setSaved = vi.fn()

    expect(applyPartialWriteResult({
      roadmap: returnedRoadmap,
      wasSaved: true,
      currentSaved: true,
      setPhases,
      setTagRegistry,
      setUpdatedAt,
      setSaved,
    })).toBe(true)

    expect(setPhases).toHaveBeenCalledWith(returnedRoadmap.phases)
    expect(setTagRegistry).toHaveBeenCalledWith(returnedRoadmap.tagRegistry)
    expect(setUpdatedAt).toHaveBeenCalledWith(returnedRoadmap.updatedAt)
    expect(setSaved).toHaveBeenCalledWith(true)
  })

  it('merges only patched fields when unrelated local state is dirty', () => {
    const merged = mergeReturnedTaskFields(
      localPhases,
      returnedRoadmap.phases,
      'RF-303',
      ['title'],
    )

    expect(merged[0].name).toBe('Local phase name')
    expect(merged[0].tasks[0]).toMatchObject({
      title: 'Server title',
      desc: 'Local description',
    })
  })

  it('advances concurrency state without replacing unrelated dirty state', () => {
    const setPhases = vi.fn()
    const setTagRegistry = vi.fn<(registry: TagDefinition[]) => void>()
    const setUpdatedAt = vi.fn()
    const setSaved = vi.fn()

    expect(applyPartialWriteResult({
      roadmap: returnedRoadmap,
      wasSaved: true,
      currentSaved: false,
      setPhases,
      setTagRegistry,
      setUpdatedAt,
      setSaved,
    })).toBe(false)

    expect(setUpdatedAt).toHaveBeenCalledWith(returnedRoadmap.updatedAt)
    expect(setPhases).not.toHaveBeenCalled()
    expect(setTagRegistry).not.toHaveBeenCalled()
    expect(setSaved).not.toHaveBeenCalled()
  })
})
