// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal } from '../ui/Modal'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmberBackground } from '../ui/EmberBackground'
import { AppHeader } from '../layout/AppHeader'
import { SiteFooter } from '../layout/SiteFooter'
import { TaskRowHeader } from '../roadmap/task-row/TaskRowHeader'
import { TaskDetailActions } from '../roadmap/task-row/TaskDetailActions'
import { TaskEditForm } from '../roadmap/TaskEditForm'
import { WorkspaceWelcomeBanner } from '../roadmap/WorkspaceBanners'
import { CreateWizard } from '../wizard/CreateWizard'

// Mock sub-components/modules to avoid deep workspace and context dependencies
vi.mock('@/components/roadmap/RoadmapSwitcher', () => ({
  RoadmapSwitcher: () => <div data-testid="roadmap-switcher" />,
}))

const mockSetDisplayName = vi.fn()
const mockSetServerRoadmapId = vi.fn()
const mockSetSessionToken = vi.fn()
const mockSetParticipantId = vi.fn()
const mockSetRole = vi.fn()
const mockSetRoadmapName = vi.fn()
const mockSetPhases = vi.fn()
const mockSetSaved = vi.fn()
const mockSetOwnerDisplayName = vi.fn()
const mockCreateLocalRoadmap = vi.fn()

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmap: () => ({
    displayName: 'Test User',
    setDisplayName: mockSetDisplayName,
    roadmapName: 'Test Roadmap',
    setRoadmapName: mockSetRoadmapName,
    createLocalRoadmap: mockCreateLocalRoadmap,
    setServerRoadmapId: mockSetServerRoadmapId,
    setSessionToken: mockSetSessionToken,
    setParticipantId: mockSetParticipantId,
    setRole: mockSetRole,
    setPhases: mockSetPhases,
    setSaved: mockSetSaved,
    setOwnerDisplayName: mockSetOwnerDisplayName,
  }),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Accessibility Unit Tests', () => {
  it('provides a discoverable feedback link separate from security reporting', () => {
    act(() => {
      root.render(<SiteFooter />)
    })

    const feedbackLink = container.querySelector('a[href="https://github.com/alteixeira20/RoadForge/issues/new/choose"]')
    expect(feedbackLink?.textContent).toBe('Report an issue or give feedback')
    expect(feedbackLink?.getAttribute('target')).toBe('_blank')
    expect(feedbackLink?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(container.textContent).toContain('Local-first. Portable. Self-hostable.')
  })

  it('renders the ember atmosphere as a decorative, non-interactive layer', () => {
    act(() => {
      root.render(<EmberBackground />)
    })

    const layer = container.querySelector('.ember-background')
    expect(layer).not.toBeNull()
    expect(layer?.getAttribute('aria-hidden')).toBe('true')
    expect(layer?.querySelector('canvas.ember-canvas')).not.toBeNull()

    act(() => {
      root.render(<EmberBackground subdued />)
    })
    expect(container.querySelector('.ember-background--subdued')).not.toBeNull()
  })

  it('verifies icon-only button accessible names (AppHeader, TaskRowHeader)', () => {
    // AppHeader Import/Export button
    act(() => {
      root.render(
        <AppHeader
          roadmapName="Test Roadmap"
          syncStatus="local"
          onIO={vi.fn()}
        />
      )
    })
    const ioButton = container.querySelector('button[title="Import / Export"]')
    expect(ioButton?.getAttribute('aria-label')).toBe('Import / Export')

    // Dark-only UI: no theme toggle is rendered anywhere in the header
    expect(container.querySelector('.theme-toggle')).toBeNull()

    // TaskRowHeader checkbox accessible name
    const task = {
      id: 'task-1',
      title: 'Accessible Task',
      done: false,
      est: '1d',
      desc: '',
      assignees: [],
      tags: [],
    }
    act(() => {
      root.render(
        <TaskRowHeader
          task={task}
          expanded={false}
          status="ready"
          statusTitle="Ready"
          visibleTags={[]}
          registry={[]}
          lockedByOther={false}
          lockHolderName=""
          showEstimate={true}
          canDrag={true}
          dragHandleTitle="Drag to reorder"
          checkDisabled={false}
          onCheck={vi.fn()}
          onToggle={vi.fn()}
        />
      )
    })
    const checkbox = container.querySelector('[role="checkbox"]')
    expect(checkbox?.getAttribute('aria-label')).toBe('Mark task "Accessible Task" as complete')
    expect(container.querySelector('.title')?.tagName).toBe('SPAN')
    expect(container.querySelector('.inline-title-trigger')).toBeNull()
  })

  it('keeps one explicit task editor action alongside subtask and dependency actions', () => {
    const onEditDetails = vi.fn()
    const onAddSubtask = vi.fn()
    const onLinkDependency = vi.fn()

    act(() => {
      root.render(
        <TaskDetailActions
          showChildActions={true}
          onEditDetails={onEditDetails}
          onAddSubtask={onAddSubtask}
          onLinkDependency={onLinkDependency}
        />,
      )
    })

    const editButtons = [...container.querySelectorAll('button')]
      .filter((button) => button.textContent?.includes('Edit details'))
    expect(editButtons).toHaveLength(1)
    expect(editButtons[0].querySelector('svg')).not.toBeNull()
    expect(container.querySelector('[aria-label="Edit description"]')).toBeNull()
    expect(container.textContent).not.toContain('EDIT')

    act(() => {
      editButtons[0].click()
      ;[...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Add subtask'))?.click()
      ;[...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Link dependency'))?.click()
    })
    expect(onEditDetails).toHaveBeenCalledOnce()
    expect(onAddSubtask).toHaveBeenCalledOnce()
    expect(onLinkDependency).toHaveBeenCalledOnce()
  })

  it('verifies dialog roles and accessible title (Modal & ConfirmDialog)', () => {
    // Modal dialog
    act(() => {
      root.render(
        <Modal open={true} onClose={vi.fn()} title="My Accessible Dialog" sub="Subtitle description">
          <div>Content</div>
        </Modal>
      )
    })
    const modalContainer = container.querySelector('[role="dialog"]')
    expect(modalContainer).not.toBeNull()
    const heading = container.querySelector('h2')
    expect(heading?.textContent).toBe('My Accessible Dialog')
    expect(modalContainer?.getAttribute('aria-labelledby')).toBe(heading?.getAttribute('id'))

    // ConfirmDialog alertdialog
    act(() => {
      root.render(
        <ConfirmDialog
          open={true}
          title="Confirm Action"
          message="Are you sure?"
          confirmLabel="Yes"
          tone="default"
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      )
    })
    const confirmModal = container.querySelector('[role="alertdialog"]')
    expect(confirmModal).not.toBeNull()
  })

  it('verifies initial focus behavior in Modal and ConfirmDialog', async () => {
    // Modal container gets focused by default if no autoFocus child
    act(() => {
      root.render(
        <Modal open={true} onClose={vi.fn()} title="Focus Dialog">
          <div>Content</div>
        </Modal>
      )
    })
    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })
    const modalContainer = container.querySelector('[role="dialog"]') as HTMLDivElement
    expect(document.activeElement).toBe(modalContainer)

    // ConfirmDialog standard tone focuses Confirm button
    act(() => {
      root.render(
        <ConfirmDialog
          key="standard"
          open={true}
          title="Standard Confirm"
          message="message"
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          tone="default"
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      )
    })
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Confirm'
    )
    expect(document.activeElement).toBe(confirmBtn)

    // ConfirmDialog danger tone focuses Cancel button
    act(() => {
      root.render(
        <ConfirmDialog
          key="danger"
          open={true}
          title="Danger Confirm"
          message="message"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          tone="danger"
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      )
    })
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Cancel'
    )
    expect(document.activeElement).toBe(cancelBtn)
  })

  it('verifies focus trapping in Modal and CreateWizard', () => {
    // 1. Modal focus trapping
    act(() => {
      root.render(
        <Modal open={true} onClose={vi.fn()} title="Focus Trap">
          <button id="btn1">Btn 1</button>
          <button id="btn2">Btn 2</button>
        </Modal>
      )
    })
    const closeBtn = container.querySelector('button.close') as HTMLButtonElement
    const btn2 = container.querySelector('#btn2') as HTMLButtonElement

    btn2.focus()
    expect(document.activeElement).toBe(btn2)

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const spyPrevent = vi.spyOn(tabEvent, 'preventDefault')
    window.dispatchEvent(tabEvent)
    expect(document.activeElement).toBe(closeBtn)
    expect(spyPrevent).toHaveBeenCalled()

    // 2. CreateWizard focus trapping
    act(() => {
      root.render(<CreateWizard onComplete={vi.fn()} onClose={vi.fn()} />)
    })
    const wizardDialog = container.querySelector('[role="dialog"]') as HTMLDivElement
    const wizardInputs = Array.from(
      wizardDialog.querySelectorAll('input, button:not([disabled])')
    ) as HTMLElement[]
    expect(wizardInputs.length).toBeGreaterThan(1)
    const firstWizard = wizardInputs[0]
    const lastWizard = wizardInputs[wizardInputs.length - 1]

    lastWizard.focus()
    const wizardTabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    const spyWizardPrevent = vi.spyOn(wizardTabEvent, 'preventDefault')
    window.dispatchEvent(wizardTabEvent)
    expect(document.activeElement).toBe(firstWizard)
    expect(spyWizardPrevent).toHaveBeenCalled()
  })

  it('verifies Escape behavior in Modal', () => {
    const onClose = vi.fn()
    act(() => {
      root.render(
        <Modal open={true} onClose={onClose} title="Escape Test">
          <div>Content</div>
        </Modal>
      )
    })

    // defaultPrevented = true should NOT call onClose
    const preventEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    vi.spyOn(preventEvent, 'defaultPrevented', 'get').mockReturnValue(true)
    window.dispatchEvent(preventEvent)
    expect(onClose).not.toHaveBeenCalled()

    // defaultPrevented = false SHOULD call onClose
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    window.dispatchEvent(escEvent)
    expect(onClose).toHaveBeenCalled()
  })

  it('verifies focus restoration in Modal', async () => {
    const triggerBtn = document.createElement('button')
    triggerBtn.id = 'trigger'
    document.body.appendChild(triggerBtn)
    triggerBtn.focus()
    expect(document.activeElement).toBe(triggerBtn)

    act(() => {
      root.render(
        <Modal open={true} onClose={vi.fn()} title="Focus Restoration">
          <div>Content</div>
        </Modal>
      )
    })

    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    act(() => {
      root.unmount()
      root = createRoot(container)
    })

    expect(document.activeElement).toBe(triggerBtn)
    triggerBtn.remove()
  })

  it('verifies onboarding banner dismissal keyboard operability', () => {
    const onDismiss = vi.fn()
    act(() => {
      root.render(
        <WorkspaceWelcomeBanner onDismiss={onDismiss} onCreateOwn={vi.fn()} />
      )
    })
    const dismissBtn = container.querySelector('[aria-label="Dismiss welcome onboarding banner"]') as HTMLButtonElement
    expect(dismissBtn).not.toBeNull()

    // Space
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true })
    dismissBtn.dispatchEvent(spaceEvent)
    expect(onDismiss).toHaveBeenCalledTimes(1)

    // Enter
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    dismissBtn.dispatchEvent(enterEvent)
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('verifies labeled fields in TaskEditForm', () => {
    const task = {
      id: 't1',
      title: 'Form Task',
      est: '3d',
      desc: 'Description detail',
      done: false,
      assignees: [],
      tags: [],
    }
    act(() => {
      root.render(
        <TaskEditForm
          task={task}
          isNested={false}
          availableAssignees={['User A']}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      )
    })

    // Check Title association
    const titleLabel = container.querySelector('label[for="edit-title-t1"]')
    const titleInput = container.querySelector('input[id="edit-title-t1"]')
    expect(titleLabel).not.toBeNull()
    expect(titleInput).not.toBeNull()

    // Check Estimate association
    const estLabel = container.querySelector('label[for="edit-est-t1"]')
    const estInput = container.querySelector('input[id="edit-est-t1"]')
    expect(estLabel).not.toBeNull()
    expect(estInput).not.toBeNull()

    // Check Description association
    const descLabel = container.querySelector('label[for="edit-desc-t1"]')
    const descInput = container.querySelector('textarea[id="edit-desc-t1"]')
    expect(descLabel).not.toBeNull()
    expect(descInput).not.toBeNull()
  })
})
