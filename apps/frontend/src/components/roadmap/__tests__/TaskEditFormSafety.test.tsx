// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskEditForm } from '../TaskEditForm'
import type { Task } from '@/types/roadmap'

const baseTask: Task = {
  id: 'task-1',
  title: 'Implement database connection',
  desc: 'Initial description',
  complexity: 'medium',
  done: false,
  claimedBy: undefined,
  claimedById: undefined,
  tags: [],
  deps: [],
  links: [],
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = Object.getPrototypeOf(element)
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('TaskEditForm safety and conflict resolution', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('incorporates remote updates to unrelated fields while preserving draft edits', () => {
    const onDirtyChange = vi.fn()

    act(() => {
      root.render(
        <TaskEditForm
          task={baseTask}
          isNested={false}
          directSubtaskCount={0}
          availableAssignees={[]}
          onSave={vi.fn()}
          onCancel={vi.fn()}
          onDirtyChange={onDirtyChange}
        />,
      )
    })

    const descTextarea = container.querySelector('#edit-desc-task-1') as HTMLTextAreaElement
    expect(descTextarea).toBeTruthy()

    act(() => {
      setNativeValue(descTextarea, 'My active draft description')
    })

    expect(descTextarea.value).toBe('My active draft description')
    expect(onDirtyChange).toHaveBeenCalledWith(true)

    // Remote collaborator changes complexity to high on the server
    const remoteUpdatedTask: Task = {
      ...baseTask,
      complexity: 'high',
    }

    act(() => {
      root.render(
        <TaskEditForm
          task={remoteUpdatedTask}
          isNested={false}
          directSubtaskCount={0}
          availableAssignees={[]}
          onSave={vi.fn()}
          onCancel={vi.fn()}
          onDirtyChange={onDirtyChange}
        />,
      )
    })

    // Local description draft must be preserved
    expect(descTextarea.value).toBe('My active draft description')

    // Unrelated remote update (complexity: high) was incorporated
    const complexitySelect = container.querySelector('#edit-complexity-task-1') as HTMLSelectElement
    expect(complexitySelect.value).toBe('high')

    // No conflict alert should be visible since the edited field was not touched remotely
    expect(container.querySelector('.task-field-conflict')).toBeNull()
  })

  it('detects same-field conflict, displays both versions, and preserves draft until resolved', () => {
    const onDirtyChange = vi.fn()
    const onSave = vi.fn()

    act(() => {
      root.render(
        <TaskEditForm
          task={baseTask}
          isNested={false}
          directSubtaskCount={0}
          availableAssignees={[]}
          onSave={onSave}
          onCancel={vi.fn()}
          onDirtyChange={onDirtyChange}
        />,
      )
    })

    const descTextarea = container.querySelector('#edit-desc-task-1') as HTMLTextAreaElement
    act(() => {
      setNativeValue(descTextarea, 'Local modified description')
    })

    expect(descTextarea.value).toBe('Local modified description')

    // Remote collaborator also edits description on the server
    const serverUpdatedTask: Task = {
      ...baseTask,
      desc: 'Server modified description from Alice',
    }

    act(() => {
      root.render(
        <TaskEditForm
          task={serverUpdatedTask}
          isNested={false}
          directSubtaskCount={0}
          availableAssignees={[]}
          onSave={onSave}
          onCancel={vi.fn()}
          onDirtyChange={onDirtyChange}
        />,
      )
    })

    // Draft must not be silently replaced
    expect(descTextarea.value).toBe('Local modified description')

    // Conflict banner and inline field conflict must appear
    const conflictWarning = container.querySelector('.edit-form-conflict-warning')
    expect(conflictWarning).toBeTruthy()
    expect(conflictWarning?.textContent).toContain('Resolve conflicting fields before saving.')

    const fieldConflict = container.querySelector('.task-field-conflict')
    expect(fieldConflict).toBeTruthy()
    expect(fieldConflict?.textContent).toContain('Server modified description from Alice')

    // Save button must be disabled while conflict remains unresolved
    const saveButton = container.querySelector('.edit-actions button.primary') as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)

    // Resolving by clicking "Keep my draft"
    const keepDraftBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Keep my draft',
    )
    expect(keepDraftBtn).toBeTruthy()
    act(() => {
      keepDraftBtn?.click()
    })

    // Conflict cleared, save button re-enabled, draft still kept
    expect(container.querySelector('.task-field-conflict')).toBeNull()
    expect(descTextarea.value).toBe('Local modified description')
    expect(saveButton.disabled).toBe(false)

    // Submitting save sends local draft
    act(() => {
      saveButton.click()
    })
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        desc: 'Local modified description',
      }),
    )
  })

  it('allows resolving same-field conflict with "Use server version"', () => {
    const onSave = vi.fn()

    act(() => {
      root.render(
        <TaskEditForm
          task={baseTask}
          isNested={false}
          directSubtaskCount={0}
          availableAssignees={[]}
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      )
    })

    const titleInput = container.querySelector('#edit-title-task-1') as HTMLInputElement
    act(() => {
      setNativeValue(titleInput, 'My Local Title')
    })

    const serverUpdatedTask: Task = {
      ...baseTask,
      title: 'Server Title from Bob',
    }

    act(() => {
      root.render(
        <TaskEditForm
          task={serverUpdatedTask}
          isNested={false}
          directSubtaskCount={0}
          availableAssignees={[]}
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      )
    })

    expect(titleInput.value).toBe('My Local Title')
    expect(container.querySelector('.task-field-conflict')).toBeTruthy()

    // Click "Use server version"
    const useServerBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Use server version',
    )
    expect(useServerBtn).toBeTruthy()
    act(() => {
      useServerBtn?.click()
    })

    // Title input now reflects server version
    expect(titleInput.value).toBe('Server Title from Bob')
    expect(container.querySelector('.task-field-conflict')).toBeNull()
  })
})
