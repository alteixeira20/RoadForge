// @vitest-environment jsdom
import React, { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { IOModal } from '@/components/share/IOModal'

const handleCancelPendingImport = vi.fn()
const fileInputRef = { current: null as HTMLInputElement | null }

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ open, children, footer }: {
    open: boolean
    children: ReactNode
    footer?: ReactNode
  }) => open ? <div role="dialog">{children}{footer}</div> : null,
}))

vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}))

vi.mock('@/components/share/ImportActions', () => ({
  ImportActions: () => <div>Import actions</div>,
}))

vi.mock('@/components/share/ImportNotice', () => ({
  ImportNotice: () => <div>Import notice</div>,
}))

vi.mock('@/components/share/useImportFlow', () => ({
  useImportFlow: () => ({
    fileInputRef,
    pendingImport: null,
    importError: null,
    isConfirming: false,
    selectImportFile: vi.fn(),
    handleImportFile: vi.fn(),
    handleConfirm: vi.fn(),
    handleCancelPendingImport,
  }),
}))

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmap: () => ({
    roadmapName: 'Public Alpha',
    phases: [
      {
        id: 'phase-1',
        num: '01',
        name: 'Launch',
        color: '#f97316',
        status: 'active',
        progress: 0,
        tasks: [{ id: 'RF-1005', title: 'Markdown export', done: false }],
      },
    ],
    tagRegistry: [],
    setPhases: vi.fn(),
    setRoadmapName: vi.fn(),
    setSaved: vi.fn(),
    setTagRegistry: vi.fn(),
    createLocalRoadmap: vi.fn(),
    saved: false,
    serverRoadmapId: null,
    sessionToken: null,
    role: null,
    ownerDisplayName: null,
    updatedAt: null,
  }),
}))

describe('IOModal Markdown export', () => {
  let container: HTMLDivElement
  let root: Root
  let anchorClick: MockInstance<() => void>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:roadmap-markdown'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    anchorClick.mockRestore()
    vi.restoreAllMocks()
  })

  it('downloads Markdown directly and exposes no PDF or coming-soon path', () => {
    const onClose = vi.fn()
    const onToast = vi.fn()

    act(() => {
      root.render(<IOModal open={true} onClose={onClose} onToast={onToast} />)
    })

    const exportTab = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Export')
    expect(exportTab).toBeDefined()

    act(() => {
      exportTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const markdownButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Download readable Markdown'))
    expect(markdownButton).toBeDefined()
    expect(container.textContent ?? '').not.toMatch(/PDF/i)

    act(() => {
      markdownButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/markdown;charset=utf-8')

    const anchor = anchorClick.mock.contexts[0]
    expect(anchor).toBeInstanceOf(HTMLAnchorElement)
    if (!(anchor instanceof HTMLAnchorElement)) {
      throw new Error('Expected the download click to run with an anchor context')
    }
    expect(anchor.download).toBe('public-alpha.roadforge.md')
    expect(onToast).toHaveBeenNthCalledWith(1, 'Preparing Markdown export...')
    expect(onToast).toHaveBeenNthCalledWith(2, 'Markdown file downloaded')
    expect(onToast.mock.calls.flat().join(' ')).not.toMatch(/coming soon/i)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
