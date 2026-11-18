// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskStructureSync } from '@/hooks/useTaskStructureSync'
import { storage } from '@/lib/storage'
import {
  createServerTask,
  deleteServerTask,
  reorderServerSubtasks,
  reorderServerTasks,
  setServerTaskDependency,
} from '@/services/roadmap-task-structure.service'
import { ApiConnectionError, ApiError } from '@/services/roadmap-http'
import type { Phase, Task } from '@/types/roadmap'

vi.mock('@/services/roadmap-task-structure.service', () => ({
  createServerTask: vi.fn(),
  deleteServerTask: vi.fn(),
  reorderServerTasks: vi.fn(),
  reorderServerSubtasks: vi.fn(),
  setServerTaskDependency: vi.fn(),
}))

const mockedCreate = vi.mocked(createServerTask)
const mockedDelete = vi.mocked(deleteServerTask)
const mockedReorder = vi.mocked(reorderServerTasks)
const mockedReorderSubtasks = vi.mocked(reorderServerSubtasks)
const mockedDependency = vi.mocked(setServerTaskDependency)

const rootA: Task = { id: 'root-a', title: 'Root A', done: false, deps: [] }
const rootB: Task = { id: 'root-b', title: 'Root B', done: false, deps: ['root-a'] }
const phaseA: Phase = {
  id: 'phase-a',
  num: '01',
  name: 'Alpha',
  color: '#111111',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [rootA, rootB],
}
const newTask: Task = {
  id: 'task-new',
  title: 'New task',
  done: false,
  next: false,
  est: '',
  complexity: 'medium',
  tags: [],
  deps: [],
  desc: '',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type HookResult = ReturnType<typeof useTaskStructureSync>

function Harness({
  phases,
  setPhases,
  setSaved,
  setUpdatedAt,
  beginFocusedWrite,
  endFocusedWrite,
  onSuccess,
  onSessionExpired,
  showToast,
  onResult,
}: {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  setUpdatedAt: (updatedAt: string) => void
  beginFocusedWrite: () => void
  endFocusedWrite: () => void
  onSuccess: () => void
  onSessionExpired: () => void
  showToast: (message: string) => void
  onResult: (result: HookResult) => void
}) {
  onResult(useTaskStructureSync({
    phases,
    setPhases,
    setSaved,
    serverRoadmapId: 'rm_1',
    sessionToken: 'session-token',
    updatedAt: '2026-08-14T09:00:00Z',
    setUpdatedAt,
    showToast,
    onSuccess,
    onSessionExpired,
    beginFocusedWrite,
    endFocusedWrite,
  }))
  return null
}

describe('useTaskStructureSync', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockedCreate.mockReset()
    mockedDelete.mockReset()
    mockedReorder.mockReset()
    mockedReorderSubtasks.mockReset()
    mockedDependency.mockReset()
    localStorage.clear()
    sessionStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderHook(initialPhases: Phase[] = [phaseA]) {
    let currentPhases = initialPhases
    const setPhases = vi.fn((next: Phase[]) => { currentPhases = next })
    const setSaved = vi.fn()
    const setUpdatedAt = vi.fn()
    const beginFocusedWrite = vi.fn()
    const endFocusedWrite = vi.fn()
    const onSuccess = vi.fn()
    const onSessionExpired = vi.fn()
    const showToast = vi.fn()
    let result!: HookResult

    const renderCurrent = () => {
      root.render(
        <Harness
          phases={currentPhases}
          setPhases={setPhases}
          setSaved={setSaved}
          setUpdatedAt={setUpdatedAt}
          beginFocusedWrite={beginFocusedWrite}
          endFocusedWrite={endFocusedWrite}
          onSuccess={onSuccess}
          onSessionExpired={onSessionExpired}
          showToast={showToast}
          onResult={(next) => { result = next }}
        />,
      )
    }

    act(renderCurrent)

    const rerenderWithPhases = (nextPhases: Phase[]) => {
      setPhases(nextPhases)
      act(renderCurrent)
    }

    return {
      get result() { return result },
      get phases() { return currentPhases },
      setPhases,
      rerenderWithPhases,
      setSaved,
      setUpdatedAt,
      beginFocusedWrite,
      endFocusedWrite,
      onSuccess,
      onSessionExpired,
      showToast,
    }
  }

  it('holds reorder behind a pending task creation barrier', async () => {
    const create = deferred<{ phases: Phase[]; updatedAt: string }>()
    mockedCreate.mockImplementationOnce(() => create.promise)
    mockedReorder.mockResolvedValueOnce({
      phases: [{ ...phaseA, tasks: [newTask, rootA, rootB] }],
      updatedAt: '2026-08-14T09:02:00Z',
    })
    const hook = renderHook()

    act(() => {
      expect(hook.result.createSyncedTask('phase-a', newTask, { onAggregateFallback: vi.fn() })).toBe(true)
      expect(hook.result.reorderSyncedTasks(
        'phase-a',
        ['task-new', 'root-a', 'root-b'],
        { onAggregateFallback: vi.fn() },
      )).toBe(true)
    })

    expect(hook.phases[0].tasks.map((task) => task.id)).toEqual(['task-new', 'root-a', 'root-b'])
    expect(hook.beginFocusedWrite).toHaveBeenCalledTimes(2)
    await act(async () => Promise.resolve())
    expect(mockedReorder).not.toHaveBeenCalled()

    await act(async () => {
      create.resolve({
        phases: [{ ...phaseA, tasks: [rootA, rootB, newTask] }],
        updatedAt: '2026-08-14T09:01:00Z',
      })
      await create.promise
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockedReorder).toHaveBeenCalledWith(
      'rm_1',
      'phase-a',
      ['task-new', 'root-a', 'root-b'],
      'session-token',
    )
    expect(hook.endFocusedWrite).toHaveBeenCalledTimes(2)
  })

  it('keeps an ambiguous create as a local draft and releases the focused gate', async () => {
    mockedCreate.mockRejectedValueOnce(new ApiConnectionError())
    const fallback = vi.fn()
    const hook = renderHook()
    let readiness!: Promise<'ready' | 'absent' | 'uncertain'>

    act(() => {
      hook.result.createSyncedTask('phase-a', newTask, { onAggregateFallback: fallback })
      readiness = hook.result.waitForTaskReady('task-new')
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await expect(readiness).resolves.toBe('uncertain')
    expect(hook.phases[0].tasks.some((task) => task.id === 'task-new')).toBe(true)
    expect(hook.setSaved).toHaveBeenCalledWith(false)
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(hook.endFocusedWrite).toHaveBeenCalledTimes(1)
  })

  it('restores a definitively rejected task deletion without losing newer surviving edits', async () => {
    const child: Task = { id: 'child-a', title: 'Child', done: false, parentId: 'root-a' }
    const before: Phase = { ...phaseA, tasks: [rootA, child, rootB] }
    const pendingDelete = deferred<never>()
    mockedDelete.mockImplementationOnce(() => pendingDelete.promise)
    const hook = renderHook([before])

    act(() => {
      hook.result.deleteSyncedTask('root-a', { onAggregateFallback: vi.fn() })
    })
    expect(hook.phases[0].tasks.map((task) => task.id)).toEqual(['root-b'])

    const newerRootB = { ...hook.phases[0].tasks[0], title: 'Root B newer edit' }
    hook.rerenderWithPhases([{ ...hook.phases[0], tasks: [newerRootB] }])

    await act(async () => {
      pendingDelete.reject(new ApiError(403, 'Forbidden'))
      try {
        await pendingDelete.promise
      } catch {
        // expected
      }
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(hook.phases[0].tasks.map((task) => task.id)).toEqual(['root-a', 'child-a', 'root-b'])
    expect(hook.phases[0].tasks.find((task) => task.id === 'root-b')?.title).toBe('Root B newer edit')
    expect(hook.showToast).toHaveBeenCalledWith('You do not have permission to delete tasks.')
    expect(hook.endFocusedWrite).toHaveBeenCalledTimes(1)
  })

  it('rolls back only one rejected dependency edge', async () => {
    mockedDependency.mockRejectedValueOnce(new ApiError(422, 'Cycle'))
    const hook = renderHook()

    act(() => {
      hook.result.setSyncedDependency('root-a', 'root-b', true, { onAggregateFallback: vi.fn() })
    })
    expect(hook.phases[0].tasks[0].deps).toEqual(['root-b'])

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(hook.phases[0].tasks[0].deps).toEqual([])
    expect(hook.showToast).toHaveBeenCalledWith('The server rejected this dependency change.')
    expect(hook.endFocusedWrite).toHaveBeenCalledTimes(1)
  })

  it('cancels a duplicate local create without removing a newer cached remote winner', async () => {
    const create = deferred<{ phases: Phase[]; updatedAt: string }>()
    mockedCreate.mockImplementationOnce(() => create.promise)
    storage.setActiveRoadmapId('local_1')
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Roadmap',
      phases: [phaseA],
      saved: true,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-08-14T09:00:00Z',
      isPasswordEnabled: false,
    })
    const hook = renderHook()
    let readiness!: Promise<'ready' | 'absent' | 'uncertain'>

    act(() => {
      hook.result.createSyncedTask('phase-a', newTask, { onAggregateFallback: vi.fn() })
      readiness = hook.result.waitForTaskReady('task-new')
    })

    const remoteWinner = { ...newTask, title: 'Remote winner' }
    const remotePhases = [{ ...phaseA, tasks: [...phaseA.tasks, remoteWinner] }]
    storage.setRoadmapCache('local_1', {
      roadmapName: 'Roadmap',
      phases: remotePhases,
      saved: true,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-08-14T09:01:00Z',
      isPasswordEnabled: false,
    })
    hook.rerenderWithPhases(remotePhases)

    await act(async () => {
      create.reject(new ApiError(409, 'Task ID already exists'))
      try {
        await create.promise
      } catch {
        // expected
      }
      await Promise.resolve()
      await Promise.resolve()
    })

    await expect(readiness).resolves.toBe('absent')
    expect(hook.phases[0].tasks.find((task) => task.id === 'task-new')).toEqual(remoteWinner)
    expect(hook.endFocusedWrite).toHaveBeenCalledTimes(1)
  })
})
