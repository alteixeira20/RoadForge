// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskClaim, type UseTaskClaimResult } from '@/hooks/useTaskClaim'
import { patchTaskClaim, deleteTaskClaim } from '@/services/roadmap-crud.service'
import { ApiError } from '@/services/roadmap-http'
import type { Phase, Roadmap, Task } from '@/types/roadmap'

const { mockedUseRoadmap } = vi.hoisted(() => ({
  mockedUseRoadmap: vi.fn(),
}))

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmap: mockedUseRoadmap,
}))
vi.mock('@/services/roadmap-crud.service', () => ({
  patchTaskClaim: vi.fn(),
  deleteTaskClaim: vi.fn(),
}))

const mockedPatchTaskClaim = vi.mocked(patchTaskClaim)
const mockedDeleteTaskClaim = vi.mocked(deleteTaskClaim)
const task: Task = {
  id: 'tk_1',
  title: 'Claimable task',
  done: false,
  assignees: [],
  tags: [],
  deps: [],
}
const phase: Phase = {
  id: 'phase-1',
  num: '01',
  name: 'Planning',
  color: '#76746e',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [task],
}

function Harness({
  currentTask,
  showToast,
  onResult,
}: {
  currentTask: Task
  showToast: (message: string) => void
  onResult: (result: UseTaskClaimResult) => void
}) {
  onResult(useTaskClaim({ task: currentTask, showToast }))
  return null
}

function roadmapResponse(claimedBy?: string): Roadmap {
  return {
    project: { id: 'rm_1', name: 'Roadmap' },
    roadmap: { id: 'rm_1', name: 'Roadmap' },
    phases: [{
      ...phase,
      tasks: [{
        ...task,
        ...(claimedBy ? { claimedBy, claimedById: 'pt_self' } : {}),
      }],
    }],
    ownerDisplayName: 'Owner',
    updatedAt: '2026-07-25T18:00:00Z',
  }
}

describe('useTaskClaim', () => {
  let container: HTMLDivElement
  let root: Root
  let result: UseTaskClaimResult
  let context: Record<string, unknown>
  let showToast: ReturnType<typeof vi.fn>

  const render = (currentTask = task) => {
    act(() => {
      root.render(
        <Harness
          currentTask={currentTask}
          showToast={showToast}
          onResult={(nextResult) => {
            result = nextResult
          }}
        />,
      )
    })
  }

  beforeEach(() => {
    mockedPatchTaskClaim.mockReset()
    mockedDeleteTaskClaim.mockReset()
    showToast = vi.fn()
    context = {
      displayName: 'Alex',
      participantId: 'pt_self',
      role: 'owner',
      serverRoadmapId: 'rm_1',
      sessionToken: 'session-token',
      phases: [phase],
      setPhases: vi.fn(),
      setSaved: vi.fn(),
      setUpdatedAt: vi.fn(),
    }
    mockedUseRoadmap.mockImplementation(() => context)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    render()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('blocks viewer claim and unclaim actions', async () => {
    context = { ...context, role: 'viewer' }
    render({ ...task, claimedBy: 'Sam', claimedById: 'pt_other' })

    await act(async () => {
      await result.handleClaim()
      await result.handleUnclaim()
    })

    expect(mockedPatchTaskClaim).not.toHaveBeenCalled()
    expect(mockedDeleteTaskClaim).not.toHaveBeenCalled()
    expect(context.setPhases).not.toHaveBeenCalled()
  })

  it('claims and unclaims local tasks without a server request', async () => {
    context = {
      ...context,
      participantId: null,
      role: 'owner',
      serverRoadmapId: null,
      sessionToken: null,
    }
    render()

    await act(async () => {
      await result.handleClaim()
    })

    expect(mockedPatchTaskClaim).not.toHaveBeenCalled()
    expect(context.setPhases).toHaveBeenCalled()
    expect(context.setSaved).toHaveBeenCalledWith(false)
  })

  it('passes an explicit owner override and applies the server roadmap', async () => {
    const serverRoadmap = roadmapResponse('Alex')
    mockedPatchTaskClaim.mockResolvedValue(serverRoadmap)
    const claimedTask = { ...task, claimedBy: 'Sam', claimedById: 'pt_other' }
    render(claimedTask)

    expect(result.canOverrideClaim).toBe(true)
    await act(async () => {
      await result.handleClaim(true)
    })

    expect(mockedPatchTaskClaim).toHaveBeenCalledWith({
      roadmapId: 'rm_1',
      taskId: 'tk_1',
      sessionToken: 'session-token',
      override: true,
    })
    expect(context.setPhases).toHaveBeenCalledWith(serverRoadmap.phases)
    expect(context.setUpdatedAt).toHaveBeenCalledWith(serverRoadmap.updatedAt)
  })

  it('reports a structured claim conflict without changing local phases', async () => {
    mockedPatchTaskClaim.mockRejectedValue(new ApiError(409, 'Already claimed'))
    render({ ...task, claimedBy: 'Sam', claimedById: 'pt_other' })

    await act(async () => {
      await result.handleClaim()
    })

    expect(showToast).toHaveBeenCalledWith('Sam is already working on this task.')
    expect(context.setPhases).not.toHaveBeenCalled()
  })
})
