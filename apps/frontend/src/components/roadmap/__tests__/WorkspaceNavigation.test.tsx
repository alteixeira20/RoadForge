// @vitest-environment jsdom

import { act, type ComponentProps } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WORKSPACE_VIEW_PANEL_ID,
  WORKSPACE_VIEW_TAB_ID,
  WorkspaceToolbar,
} from '@/components/roadmap/WorkspaceToolbar'
import { DEFAULT_FILTER_STATE } from '@/lib/task-filters'

const ACTIVITY_HINT =
  'Activity becomes available after this roadmap is saved or synced.'

function createProps(
  overrides: Partial<ComponentProps<typeof WorkspaceToolbar>> = {},
): ComponentProps<typeof WorkspaceToolbar> {
  return {
    filterState: { ...DEFAULT_FILTER_STATE },
    onFilterChange: vi.fn(),
    onClearFilters: vi.fn(),
    assignmentNames: [],
    tagIds: [],
    tagLabels: new Map(),
    phaseOptions: [],
    workspaceView: 'roadmap',
    onWorkspaceViewChange: vi.fn(),
    allOpen: false,
    onCollapseAll: vi.fn(),
    onExpandAll: vi.fn(),
    onOpenActivity: vi.fn(),
    onOpenVersions: vi.fn(),
    hasServerActivity: false,
    canViewTeam: false,
    canViewVersions: false,
    canTogglePhaseExpansion: true,
    ...overrides,
  }
}

function buttonWith(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  )
}

describe('roadmap navigation and tools card', () => {
  let container: HTMLElement
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

  it('renders exactly one navigation row and one tools row', () => {
    act(() => root.render(<WorkspaceToolbar {...createProps()} />))

    expect(container.querySelectorAll('.workspace-nav-row')).toHaveLength(1)
    expect(container.querySelectorAll('.workspace-tools-row')).toHaveLength(1)
  })

  it('does not render Add phase in the top toolbar in any view', () => {
    act(() => root.render(<WorkspaceToolbar {...createProps()} />))
    expect(buttonWith(container, 'Add phase')).toBeUndefined()

    act(() =>
      root.render(
        <WorkspaceToolbar
          {...createProps({ workspaceView: 'team', canViewTeam: true })}
        />,
      ),
    )
    expect(buttonWith(container, 'Add phase')).toBeUndefined()

    act(() =>
      root.render(
        <WorkspaceToolbar {...createProps({ workspaceView: 'tags' })} />,
      ),
    )
    expect(buttonWith(container, 'Add phase')).toBeUndefined()
  })

  it('keeps the exploration tools available', () => {
    act(() => root.render(<WorkspaceToolbar {...createProps()} />))

    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search roadmap tasks"]',
    )
    expect(search).not.toBeNull()
    expect(search?.placeholder).toBe('Search tasks, phases, tags, or people...')
    expect(buttonWith(container, 'Filters')).toBeInstanceOf(HTMLButtonElement)
    expect(buttonWith(container, 'Expand all')).toBeInstanceOf(HTMLButtonElement)
    expect(container.querySelector('.workspace-tools-row .toolbar-tags-action')).toBeNull()
    expect(
      container.querySelector('[role="tab"][data-workspace-view="tags"]'),
    ).toBeInstanceOf(HTMLButtonElement)
  })

  it('hides task exploration tools while Tags is selected', () => {
    act(() =>
      root.render(
        <WorkspaceToolbar {...createProps({ workspaceView: 'tags' })} />,
      ),
    )

    expect(container.querySelector('.workspace-tools-row')).toBeNull()
    expect(container.querySelector('.active-filter-chips')).toBeNull()
  })

  it('routes search input through the filter contract unchanged', () => {
    const onFilterChange = vi.fn()
    act(() => root.render(<WorkspaceToolbar {...createProps({ onFilterChange })} />))

    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search roadmap tasks"]',
    )!
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(search, 'payments')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(onFilterChange).toHaveBeenCalledWith('query', 'payments')
  })

  it('uses tab semantics for the view tabs and links them to the panel', () => {
    act(() =>
      root.render(<WorkspaceToolbar {...createProps({ canViewTeam: true })} />),
    )

    const tablist = container.querySelector('[role="tablist"]')
    expect(tablist?.getAttribute('aria-label')).toBe('Workspace views')

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'))
    expect(tabs).toHaveLength(3)
    expect(tabs[0].id).toBe(WORKSPACE_VIEW_TAB_ID.roadmap)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('aria-controls')).toBe(WORKSPACE_VIEW_PANEL_ID)
    expect(tabs[0].getAttribute('tabindex')).toBe('0')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
    expect(tabs[1].getAttribute('tabindex')).toBe('-1')
    expect(tabs[1].id).toBe(WORKSPACE_VIEW_TAB_ID.tags)
    expect(tabs[2].id).toBe(WORKSPACE_VIEW_TAB_ID.team)
  })

  it('moves between tabs with arrow keys and Home/End', () => {
    const onWorkspaceViewChange = vi.fn()
    act(() =>
      root.render(
        <WorkspaceToolbar
          {...createProps({ canViewTeam: true, onWorkspaceViewChange })}
        />,
      ),
    )

    const tablist = container.querySelector('[role="tablist"]')!
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    act(() => tabs[0].focus())

    act(() => {
      tablist.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(tabs[1])
    expect(onWorkspaceViewChange).toHaveBeenLastCalledWith('tags')

    act(() => {
      tablist.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(tabs[2])
    expect(onWorkspaceViewChange).toHaveBeenLastCalledWith('team')

    act(() => {
      tablist.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(tabs[0])
    expect(onWorkspaceViewChange).toHaveBeenLastCalledWith('roadmap')
  })

  it('marks Activity unavailable for local roadmaps without a standalone row', () => {
    const onOpenActivity = vi.fn()
    act(() =>
      root.render(
        <WorkspaceToolbar
          {...createProps({ hasServerActivity: false, onOpenActivity })}
        />,
      ),
    )

    const activity = buttonWith(container, 'Activity')!
    expect(activity.getAttribute('aria-disabled')).toBe('true')
    expect(activity.getAttribute('title')).toBe(ACTIVITY_HINT)

    // The reason stays reachable, but only through the description.
    const describedBy = activity.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    // Attribute selector: useId produces ids containing colons.
    const hint = container.querySelector(`[id="${describedBy}"]`)
    expect(hint?.textContent).toBe(ACTIVITY_HINT)
    expect(hint?.classList.contains('workspace-tab-hint')).toBe(true)

    // No permanent full-width sentence, and clicking cannot open a panel.
    expect(container.querySelector('.activity-helper')).toBeNull()
    expect(container.textContent).not.toContain('Activity is available after save or sync')
    act(() => activity.click())
    expect(onOpenActivity).not.toHaveBeenCalled()
  })

  it('enables Activity for server-backed roadmaps', () => {
    const onOpenActivity = vi.fn()
    act(() =>
      root.render(
        <WorkspaceToolbar
          {...createProps({ hasServerActivity: true, onOpenActivity })}
        />,
      ),
    )

    const activity = buttonWith(container, 'Activity')!
    expect(activity.hasAttribute('aria-disabled')).toBe(false)
    expect(activity.getAttribute('aria-describedby')).toBeNull()
    act(() => activity.click())
    expect(onOpenActivity).toHaveBeenCalledTimes(1)
  })

  it('shows Team and Versions only when the role allows them', () => {
    act(() => root.render(<WorkspaceToolbar {...createProps()} />))
    expect(buttonWith(container, 'Team')).toBeUndefined()
    expect(buttonWith(container, 'Versions')).toBeUndefined()

    act(() =>
      root.render(
        <WorkspaceToolbar
          {...createProps({ canViewTeam: true, canViewVersions: true })}
        />,
      ),
    )
    expect(buttonWith(container, 'Team')).toBeInstanceOf(HTMLButtonElement)
    expect(buttonWith(container, 'Versions')).toBeInstanceOf(HTMLButtonElement)
  })
})

describe('roadmap toolbar stylesheet contract', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/styles/workspace/workspace-toolbar.css'),
    'utf8',
  )

  it('lets search absorb the row while utilities stay compact', () => {
    const search = css.slice(
      css.indexOf('.workspace-tools-row > .search {'),
      css.indexOf('/* Explains a disabled tab'),
    )
    expect(search).toContain('flex: 1 1 auto')
    expect(search).toContain('min-width: 240px')
    expect(search).toContain('flex: 0 0 auto')
    expect(search).toContain('white-space: nowrap')
  })

  it('gives search its own line from 900px down', () => {
    const narrow = css.slice(
      css.indexOf('@media (max-width: 900px)'),
      css.indexOf('@media (max-width: 600px)'),
    )
    expect(narrow).toContain('flex-wrap: wrap')
    expect(narrow).toContain('flex: 1 1 100%')
  })

  it('drops the removed toolbar add-phase and activity helper styles', () => {
    expect(css).not.toContain('toolbar-add-phase-action')
    expect(css).not.toContain('.activity-helper')
  })
})
