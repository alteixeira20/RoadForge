// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRoadmapRename } from '@/hooks/useRoadmapRename'
import { storage } from '@/lib/storage'
import { patchRoadmapName } from '@/services/roadmap-structure.service'
import { ApiConnectionError, ApiError } from '@/services/roadmap-http'

vi.mock('@/services/roadmap-structure.service', () => ({
  patchRoadmapName: vi.fn(),
}))

const mockedPatchRoadmapName = vi.mocked(patchRoadmapName)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type HookResult = ReturnType<typeof useRoadmapRename>
type HookParams = Parameters<typeof useRoadmapRename>[0]

function Harness({
  params,
  onResult,
}: {
  params: HookParams
  onResult: (result: HookResult) => void
}) {
  onResult(useRoadmapRename(params))
  return null
}

describe('useRoadmapRename', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mockedPatchRoadmapName.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderHook(overrides: Partial<HookParams> = {}) {
    const params: HookParams = {
      roadmapName: 'Current roadmap',
      setRoadmapName: vi.fn(),
      setSaved: vi.fn(),
      canRename: true,
      serverRoadmapId: 'rm_1',
      sessionToken: 'session-token',
      updatedAt: '2026-08-14T09:00:00Z',
      setUpdatedAt: vi.fn(),
      onLocalRename: vi.fn(() => true),
      showMessage: vi.fn(),
      onSessionExpired: vi.fn(),
      ...overrides,
    }
    let result!: HookResult
    act(() => {
      root.render(
        <Harness params={params} onResult={(next) => { result = next }} />,
      )
    })
    return { params, get result() { return result } }
  }

  it('keeps local-only rename on the existing local callback', () => {
    const harness = renderHook({
      serverRoadmapId: null,
      sessionToken: null,
    })

    let accepted = false
    act(() => {
      accepted = harness.result.handleRenameRoadmap('  Local rename  ')
    })

    expect(accepted).toBe(true)
    expect(harness.params.onLocalRename).toHaveBeenCalledWith('Local rename')
    expect(mockedPatchRoadmapName).not.toHaveBeenCalled()
    expect(harness.params.setRoadmapName).not.toHaveBeenCalled()
  })

  it('optimistically renames then applies authoritative normalization', async () => {
    const response = deferred<{ roadmapName: string; updatedAt: string }>()
    mockedPatchRoadmapName.mockImplementationOnce(() => response.promise)
    const harness = renderHook()

    act(() => {
      expect(harness.result.handleRenameRoadmap('  Renamed roadmap  ')).toBe(true)
    })
    expect(harness.params.setRoadmapName).toHaveBeenCalledWith('Renamed roadmap')

    await act(async () => Promise.resolve())
    expect(mockedPatchRoadmapName).toHaveBeenCalledWith(
      'rm_1',
      'Renamed roadmap',
      'session-token',
    )

    await act(async () => {
      response.resolve({
        roadmapName: 'Renamed roadmap',
        updatedAt: '2026-08-14T09:01:00Z',
      })
      await response.promise
      await Promise.resolve()
    })

    expect(harness.params.setUpdatedAt).toHaveBeenCalledWith('2026-08-14T09:01:00Z')
    expect(harness.params.setSaved).not.toHaveBeenCalled()
  })

  it('serializes rapid renames and prevents an older response from replacing the newer name', async () => {
    const first = deferred<{ roadmapName: string; updatedAt: string }>()
    const second = deferred<{ roadmapName: string; updatedAt: string }>()
    mockedPatchRoadmapName
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const setRoadmapName = vi.fn()
    const harness = renderHook({ setRoadmapName })

    act(() => {
      harness.result.handleRenameRoadmap('First')
      harness.result.handleRenameRoadmap('Second')
    })
    expect(setRoadmapName).toHaveBeenLastCalledWith('Second')

    await act(async () => Promise.resolve())
    expect(mockedPatchRoadmapName).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve({ roadmapName: 'First', updatedAt: '2026-08-14T09:01:00Z' })
      await first.promise
      await Promise.resolve()
    })
    expect(setRoadmapName).toHaveBeenLastCalledWith('Second')
    expect(mockedPatchRoadmapName).toHaveBeenCalledTimes(2)

    await act(async () => {
      second.resolve({ roadmapName: 'Second', updatedAt: '2026-08-14T09:02:00Z' })
      await second.promise
      await Promise.resolve()
    })
    expect(setRoadmapName).toHaveBeenLastCalledWith('Second')
  })

  it('does not regress a newer external server revision when a queued rename response arrives late', async () => {
    const response = deferred<{ roadmapName: string; updatedAt: string }>()
    mockedPatchRoadmapName.mockImplementationOnce(() => response.promise)
    const setUpdatedAt = vi.fn()
    const base = renderHook({ setUpdatedAt })

    act(() => {
      base.result.handleRenameRoadmap('Renamed')
    })
    await act(async () => Promise.resolve())

    const newerParams: HookParams = {
      ...base.params,
      roadmapName: 'Renamed',
      updatedAt: '2026-08-14T09:05:00Z',
    }
    act(() => {
      root.render(
        <Harness params={newerParams} onResult={() => {}} />,
      )
    })

    await act(async () => {
      response.resolve({
        roadmapName: 'Renamed',
        updatedAt: '2026-08-14T09:04:00Z',
      })
      await response.promise
      await Promise.resolve()
    })

    expect(setUpdatedAt).not.toHaveBeenCalled()
  })

  it('does not let an older rename response overwrite a newer realtime revision before rerender', async () => {
    const response = deferred<{ roadmapName: string; updatedAt: string }>()
    mockedPatchRoadmapName.mockImplementationOnce(() => response.promise)

    let visibleName = 'Current roadmap'
    const setRoadmapName = vi.fn((name: string) => {
      visibleName = name
    })
    const setUpdatedAt = vi.fn()

    storage.setActiveRoadmapId('rm_1')
    storage.setRoadmapCache('rm_1', {
      roadmapName: visibleName,
      phases: [],
      saved: true,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-08-14T09:00:00Z',
      isPasswordEnabled: false,
    })

    const harness = renderHook({ setRoadmapName, setUpdatedAt })
    act(() => {
      harness.result.handleRenameRoadmap('Local pending')
    })
    await act(async () => Promise.resolve())

    // Realtime applies a newer rename and writes its revision to the shared
    // browser cache before this hook has rerendered with the new props.
    visibleName = 'Remote newer'
    storage.setRoadmapCache('rm_1', {
      roadmapName: visibleName,
      phases: [],
      saved: true,
      ownerDisplayName: 'Owner',
      updatedAt: '2026-08-14T09:05:00Z',
      isPasswordEnabled: false,
    })

    await act(async () => {
      response.resolve({
        roadmapName: 'Older local response',
        updatedAt: '2026-08-14T09:04:00Z',
      })
      await response.promise
      await Promise.resolve()
    })

    expect(visibleName).toBe('Remote newer')
    expect(setRoadmapName).not.toHaveBeenCalledWith('Older local response')
    expect(setUpdatedAt).not.toHaveBeenCalled()
  })

  it('keeps an ambiguous connection outcome as a local recovery draft', async () => {
    mockedPatchRoadmapName.mockRejectedValue(new ApiConnectionError())
    const harness = renderHook()

    act(() => {
      harness.result.handleRenameRoadmap('Possibly committed')
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(harness.params.setRoadmapName).toHaveBeenCalledWith('Possibly committed')
    expect(harness.params.setSaved).toHaveBeenCalledWith(false)
    expect(harness.params.showMessage).toHaveBeenCalledWith(
      'Connection lost. Kept the roadmap name locally while RoadForge reconnects.',
    )
  })

  it('rolls back definitive permission failures', async () => {
    mockedPatchRoadmapName.mockRejectedValue(new ApiError(403, 'Forbidden'))
    const harness = renderHook()

    act(() => {
      harness.result.handleRenameRoadmap('Forbidden rename')
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(harness.params.setRoadmapName).toHaveBeenLastCalledWith('Current roadmap')
    expect(harness.params.showMessage).toHaveBeenCalledWith(
      'You do not have permission to rename this roadmap.',
    )
  })
})