// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionsPanel } from '@/components/roadmap/VersionsPanel'
import { ApiError } from '@/services/roadmap-http'
import { createRoadmapCheckpoint, getRoadmapVersions, restoreRoadmapVersion } from '@/services/roadmap-crud.service'
import type { Roadmap, RoadmapVersionSummary } from '@/types/roadmap'

vi.mock('@/services/roadmap-crud.service', () => ({
  getRoadmapVersions: vi.fn(),
  restoreRoadmapVersion: vi.fn(),
  createRoadmapCheckpoint: vi.fn(),
}))

const mockedGetVersions = vi.mocked(getRoadmapVersions)
const mockedRestore = vi.mocked(restoreRoadmapVersion)
const mockedCheckpoint = vi.mocked(createRoadmapCheckpoint)

const versions: RoadmapVersionSummary[] = [
  {
    id: 'rv_1',
    versionNumber: 1,
    createdAt: '2026-07-25T18:00:00Z',
    actorName: 'Owner',
    action: 'roadmap.created',
    phaseCount: 0,
    taskCount: 0,
  },
]

const restoredRoadmap = { id: 'rm_1', name: 'Restored' } as unknown as Roadmap

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('VersionsPanel', () => {
  let container: HTMLDivElement
  let root: Root
  let onRestored: ReturnType<typeof vi.fn>
  let onToast: ReturnType<typeof vi.fn>
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onRestored = vi.fn()
    onToast = vi.fn()
    onClose = vi.fn()
    mockedGetVersions.mockReset().mockResolvedValue(versions)
    mockedRestore.mockReset()
    mockedCheckpoint.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (overrides: Partial<Parameters<typeof VersionsPanel>[0]> = {}) => {
    act(() => {
      root.render(
        <VersionsPanel
          roadmapId="rm_1"
          sessionToken="session-token"
          currentUpdatedAt="2026-07-25T18:00:00Z"
          hasUnsavedChanges={false}
          onClose={onClose}
          onRestored={onRestored}
          onToast={onToast}
          canManageVersions
          {...overrides}
        />,
      )
    })
  }

  // ConfirmDialog/Modal renders through a portal to document.body, not
  // inside `container`, so dialog buttons must be queried from the document.
  const clickButtonByText = (text: string) => {
    const button = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === text)
    if (!button) throw new Error(`button "${text}" not found`)
    act(() => button.click())
  }

  it('restores a version with the current base revision on confirm', async () => {
    mockedRestore.mockResolvedValue(restoredRoadmap)
    render()
    await flush()

    clickButtonByText('Restore')
    clickButtonByText('Restore version')
    await flush()

    expect(mockedRestore).toHaveBeenCalledWith(
      'rm_1', 'rv_1', 'session-token', '2026-07-25T18:00:00Z', false,
    )
    expect(onRestored).toHaveBeenCalledWith(restoredRoadmap)
    expect(onClose).toHaveBeenCalled()
  })

  it('opens the conflict dialog instead of a generic error toast on a stale restore', async () => {
    mockedRestore.mockRejectedValueOnce(new ApiError(
      409,
      'Roadmap was updated by another session',
      'roadmap_conflict',
      {
        roadmap_id: 'rm_1',
        server_updated_at: '2026-07-25T19:00:00Z',
        client_last_updated_at: '2026-07-25T18:00:00Z',
        server: { name: 'Someone else edited this', phases: [] },
      },
    ))
    render()
    await flush()

    clickButtonByText('Restore')
    clickButtonByText('Restore version')
    await flush()

    expect(onToast).not.toHaveBeenCalled()
    const message = document.querySelector('.confirm-dialog-message')?.textContent ?? ''
    expect(message).toContain('Someone else edited this')

    mockedRestore.mockResolvedValueOnce(restoredRoadmap)
    clickButtonByText('Force restore anyway')
    await flush()

    expect(mockedRestore).toHaveBeenLastCalledWith(
      'rm_1', 'rv_1', 'session-token', '2026-07-25T19:00:00Z', true,
    )
    expect(onRestored).toHaveBeenCalledWith(restoredRoadmap)
  })

  it('refreshes the conflict dialog instead of showing success on a second 409', async () => {
    mockedRestore.mockRejectedValueOnce(new ApiError(
      409,
      'Roadmap was updated by another session',
      'roadmap_conflict',
      {
        roadmap_id: 'rm_1',
        server_updated_at: '2026-07-25T19:00:00Z',
        client_last_updated_at: '2026-07-25T18:00:00Z',
        server: { name: 'Revision B', phases: [] },
      },
    ))
    render()
    await flush()

    clickButtonByText('Restore')
    clickButtonByText('Restore version')
    await flush()

    // A collaborator saves again before the owner's force confirmation
    // lands: the force retry (carrying revision B) hits another 409 for
    // revision C rather than succeeding.
    mockedRestore.mockRejectedValueOnce(new ApiError(
      409,
      'Roadmap was updated by another session',
      'roadmap_conflict',
      {
        roadmap_id: 'rm_1',
        server_updated_at: '2026-07-25T20:00:00Z',
        client_last_updated_at: '2026-07-25T19:00:00Z',
        server: { name: 'Revision C', phases: [] },
      },
    ))
    clickButtonByText('Force restore anyway')
    await flush()

    expect(onRestored).not.toHaveBeenCalled()
    expect(onToast).not.toHaveBeenCalled()
    const message = document.querySelector('.confirm-dialog-message')?.textContent ?? ''
    expect(message).toContain('Revision C')

    // Forcing again now carries the freshly reviewed revision C.
    mockedRestore.mockResolvedValueOnce(restoredRoadmap)
    clickButtonByText('Force restore anyway')
    await flush()

    expect(mockedRestore).toHaveBeenLastCalledWith(
      'rm_1', 'rv_1', 'session-token', '2026-07-25T20:00:00Z', true,
    )
    expect(onRestored).toHaveBeenCalledWith(restoredRoadmap)
  })

  it('warns about unsaved local changes before restoring', async () => {
    render({ hasUnsavedChanges: true })
    await flush()

    clickButtonByText('Restore')

    const message = document.querySelector('.confirm-dialog-message')?.textContent ?? ''
    expect(message).toContain('unsaved local changes')
  })

  it('does not expose restore or checkpoint controls to non-owner roles', async () => {
    render({ canManageVersions: false })
    await flush()

    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent)
    expect(buttons).not.toContain('Restore')
    expect(buttons.some((label) => label?.includes('checkpoint'))).toBe(false)
    expect(mockedCheckpoint).not.toHaveBeenCalled()
  })
})
