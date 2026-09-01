// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskClaim, type UseTaskClaimResult } from '@/hooks/useTaskClaim'
import { patchTaskClaim, deleteTaskClaim } from '@/services/roadmap-crud.service'
import type { Phase, Task } from '@/types/roadmap'

const { mockedUseRoadmapData, mockedUseRoadmapSession } = vi.hoisted(() => ({
  mockedUseRoadmapData: vi.fn(),
  mockedUseRoadmapSession: vi.fn(),
}))

vi.mock('@/config/capabilities', () => ({
  TEAM_FEATURES_ENABLED: false,
}))
vi.mock('@/context/RoadmapContext', () => ({
  useRoadmapData: mockedUseRoadmapData,
  useRoadmapSession: mockedUseRoadmapSession,
}))
vi.mock('@/services/roadmap-crud.service', () => ({
  patchTaskClaim: vi.fn(),
  deleteTaskClaim: vi.fn(),
}))

const mockedPatchTaskClaim = vi.mocked(patchTaskClaim)
const mockedDeleteTaskClaim = vi.mocked(deleteTaskClaim)
const task: Task = {
  id: 'tk_1',
  title: 'Solo task',
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

describe('useTaskClaim in solo mode', () => {
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
          onResult={(nextResult) => { result = nextResult }}
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
    mockedUseRoadmapData.mockImplementation(() => context)
    mockedUseRoadmapSession.mockImplementation(() => context)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    render({ ...task, claimedBy: 'Sam', claimedById: 'pt_other' })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('does not send claim or unclaim requests for a server-backed roadmap', async () => {
    expect(result.canOverrideClaim).toBe(false)

    await act(async () => {
      await result.handleClaim(true)
      await result.handleUnclaim(true)
    })

    expect(mockedPatchTaskClaim).not.toHaveBeenCalled()
    expect(mockedDeleteTaskClaim).not.toHaveBeenCalled()
    expect(context.setPhases).not.toHaveBeenCalled()
    expect(context.setUpdatedAt).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('does not apply local claim state when collaboration is dormant', async () => {
    context = {
      ...context,
      participantId: null,
      serverRoadmapId: null,
      sessionToken: null,
    }
    render(task)

    await act(async () => {
      await result.handleClaim()
      await result.handleUnclaim()
    })

    expect(mockedPatchTaskClaim).not.toHaveBeenCalled()
    expect(mockedDeleteTaskClaim).not.toHaveBeenCalled()
    expect(context.setPhases).not.toHaveBeenCalled()
    expect(context.setSaved).not.toHaveBeenCalled()
  })
})
