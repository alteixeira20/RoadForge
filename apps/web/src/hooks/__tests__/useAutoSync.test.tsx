// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoSync } from '@/hooks/useAutoSync'
import { saveToServer } from '@/services/roadmap-crud.service'
import type { ActivityChange, Phase } from '@/types/roadmap'

vi.mock('@/services/roadmap-crud.service', () => ({
  saveToServer: vi.fn(),
}))

const mockedSaveToServer = vi.mocked(saveToServer)

const phase: Phase = {
  id: 'rf-p-1',
  num: '01',
  name: 'Planning',
  color: '#76746e',
  colorMode: 'auto',
  status: 'active',
  progress: 0,
  tasks: [],
}

type AutoSyncParams = Parameters<typeof useAutoSync>[0]

function Harness({ params }: { params: AutoSyncParams }) {
  useAutoSync(params)
  return null
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function saveResponse(updatedAt: string): Awaited<ReturnType<typeof saveToServer>> {
  return {
    id: 'roadmap-1',
    name: 'RoadForge',
    owner_display_name: 'Owner',
    schema_version: '1.0',
    phases: [phase],
    tag_registry: [],
    is_password_enabled: false,
    created_at: '2026-07-25T16:00:00Z',
    updated_at: updatedAt,
  }
}

describe('useAutoSync pending activity', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    mockedSaveToServer.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('acknowledges only the captured activity and retries edits made in flight', async () => {
    const firstSave = deferred<Awaited<ReturnType<typeof saveToServer>>>()
    mockedSaveToServer
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValueOnce(saveResponse('2026-07-25T17:01:00Z'))

    const rename: ActivityChange = {
      action: 'phase.updated',
      phaseId: phase.id,
      phaseField: 'name',
      nextValue: 'Discovery',
    }
    const color: ActivityChange = {
      action: 'phase.updated',
      phaseId: phase.id,
      phaseField: 'color',
      nextValue: '#38bdf8',
    }
    const onSyncSuccess = vi.fn()
    const baseParams: AutoSyncParams = {
      serverRoadmapId: 'roadmap-1',
      sessionToken: 'session-token',
      readOnly: false,
      saved: false,
      phases: [phase],
      roadmapName: 'RoadForge',
      tagRegistry: [],
      updatedAt: '2026-07-25T17:00:00Z',
      pendingActivityChanges: [rename],
      partialWriteInFlight: false,
      showActivity: false,
      onSyncSuccess,
      onActivityRefresh: vi.fn(),
      onToast: vi.fn(),
      onSessionExpired: vi.fn(),
    }

    act(() => root.render(<Harness params={baseParams} />))
    act(() => vi.advanceTimersByTime(1500))
    expect(mockedSaveToServer).toHaveBeenCalledTimes(1)

    const editedPhases = [{ ...phase, name: 'Discovery', color: '#38bdf8' }]
    act(() => {
      root.render(
        <Harness
          params={{
            ...baseParams,
            phases: editedPhases,
            pendingActivityChanges: [rename, color],
          }}
        />,
      )
    })
    act(() => vi.advanceTimersByTime(1500))
    expect(mockedSaveToServer).toHaveBeenCalledTimes(1)

    await act(async () => {
      firstSave.resolve(saveResponse('2026-07-25T17:00:30Z'))
      await Promise.resolve()
    })
    expect(onSyncSuccess).toHaveBeenNthCalledWith(
      1,
      '2026-07-25T17:00:30Z',
      false,
      [rename],
    )

    act(() => {
      root.render(
        <Harness
          params={{
            ...baseParams,
            phases: editedPhases,
            updatedAt: '2026-07-25T17:00:30Z',
            pendingActivityChanges: [color],
          }}
        />,
      )
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(mockedSaveToServer).toHaveBeenCalledTimes(2)
    expect(mockedSaveToServer.mock.calls[1]?.[5]).toEqual(color)
    expect(onSyncSuccess).toHaveBeenNthCalledWith(
      2,
      '2026-07-25T17:01:00Z',
      true,
      [color],
    )
  })
})
