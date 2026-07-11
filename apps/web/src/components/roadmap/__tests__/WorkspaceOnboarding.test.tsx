// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Workspace } from '../Workspace'
import { WorkspaceHead } from '../WorkspaceHead'
import { WorkspaceWelcomeBanner } from '../WorkspaceBanners'
import { storage } from '@/lib/storage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

let mockIsSample = false
let mockActiveRoadmapId = 'local-123'

vi.mock('@/context/RoadmapContext', () => ({
  useRoadmapData: () => ({
    displayName: 'Test User',
    roadmapName: 'Test Roadmap',
    setRoadmapName: vi.fn(),
    phases: [],
    setPhases: vi.fn(),
    tagRegistry: [],
    setTagRegistry: vi.fn(),
    saved: false,
    setSaved: vi.fn(),
    ownerDisplayName: null,
    setOwnerDisplayName: vi.fn(),
    updatedAt: null,
    setUpdatedAt: vi.fn(),
    isSample: mockIsSample,
  }),
  useRoadmapSession: () => ({
    serverRoadmapId: null,
    setServerRoadmapId: vi.fn(),
    sessionToken: null,
    setSessionToken: vi.fn(),
    participantId: null,
    setParticipantId: vi.fn(),
    role: 'owner',
    setRole: vi.fn(),
  }),
  useRoadmapLifecycle: () => ({
    activeRoadmapId: mockActiveRoadmapId,
    accessRevokedEvent: null,
    clearAccessRevokedEvent: vi.fn(),
    sessionExpiredRoadmapId: null,
    clearSessionExpiredNotice: vi.fn(),
    roadmapUpgradeNotice: null,
    dismissRoadmapUpgradeNotice: vi.fn(),
    realtimeStatus: 'disconnected',
  }),
  useRoadmap: () => ({
    displayName: 'Test User',
    roadmapName: 'Test Roadmap',
    setRoadmapName: vi.fn(),
    phases: [],
    setPhases: vi.fn(),
    tagRegistry: [],
    setTagRegistry: vi.fn(),
    saved: false,
    setSaved: vi.fn(),
    ownerDisplayName: null,
    setOwnerDisplayName: vi.fn(),
    updatedAt: null,
    setUpdatedAt: vi.fn(),
    isSample: mockIsSample,
    serverRoadmapId: null,
    setServerRoadmapId: vi.fn(),
    sessionToken: null,
    setSessionToken: vi.fn(),
    participantId: null,
    setParticipantId: vi.fn(),
    role: 'owner',
    setRole: vi.fn(),
    activeRoadmapId: mockActiveRoadmapId,
    accessRevokedEvent: null,
    clearAccessRevokedEvent: vi.fn(),
    sessionExpiredRoadmapId: null,
    clearSessionExpiredNotice: vi.fn(),
    roadmapUpgradeNotice: null,
    dismissRoadmapUpgradeNotice: vi.fn(),
    realtimeStatus: 'disconnected',
    activateRoadmap: vi.fn(),
    removeRoadmapFromBrowser: vi.fn(),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn(),
  }),
}))

vi.mock('@/hooks/useWorkspaceModals', () => ({
  useWorkspaceModals: () => ({
    showSave: false,
    showShare: false,
    showIO: false,
    showTagRegistry: false,
    openSave: vi.fn(),
    openShare: vi.fn(),
    openIO: vi.fn(),
    openTagRegistry: vi.fn(),
    closeSave: vi.fn(),
    closeShare: vi.fn(),
    closeIO: vi.fn(),
    closeTagRegistry: vi.fn(),
  }),
}))

vi.mock('@/hooks/useWorkspaceViewModel', () => ({
  useWorkspaceViewModel: () => ({
    allTasks: [],
    totalDone: 0,
    nextReadyCount: 0,
    canViewTeam: false,
    filterState: {
      query: '',
      status: 'all',
      assignees: [],
      tags: [],
      phaseIds: [],
    },
    setFilterField: vi.fn(),
    clearFilters: vi.fn(),
    assignmentNames: [],
    tagIds: [],
    tagLabels: [],
    phaseOptions: [],
    workspaceView: 'roadmap',
    setWorkspaceView: vi.fn(),
    visiblePhases: [],
    isFiltering: false,
    effectiveOpenPhases: [],
    togglePhase: vi.fn(),
    allOpen: false,
    collapseAll: vi.fn(),
    expandAll: vi.fn(),
    taskEditorAssigneeNames: [],
  }),
}))

vi.mock('@/hooks/useExpandedTaskState', () => ({
  useExpandedTaskState: () => ({
    expandedTaskId: null,
    setExpandedTaskId: vi.fn(),
    toggleExpandedTask: vi.fn(),
  }),
}))

vi.mock('@/hooks/useToastState', () => ({
  useToastState: () => ({
    toasts: [],
    showToast: vi.fn(),
    dismissToast: vi.fn(),
  }),
}))

vi.mock('@/hooks/useTaskDonePatch', () => ({
  useTaskDonePatch: () => ({
    pendingTaskDoneIds: [],
    partialWriteInFlight: false,
    isTaskDonePatchInFlight: false,
    patchSyncedTaskDone: vi.fn(),
  }),
}))

vi.mock('@/hooks/useTaskPatch', () => ({
  useTaskPatch: () => ({
    taskPatchInFlight: false,
    patchSyncedTask: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSaveFlow', () => ({
  useSaveFlow: () => ({
    syncStatus: 'synced',
    isConflict: false,
    conflictMetadata: null,
    showConflictReview: false,
    keepLocalLoading: false,
    confirmReload: false,
    activityRefreshKey: 0,
    addPendingActivityChange: vi.fn(),
    replacePendingActivityChanges: vi.fn(),
    refreshActivity: vi.fn(),
    markServerStateHealthy: vi.fn(),
    handleSessionExpired: vi.fn(),
    handlePartialWriteConflict: vi.fn(),
    handleConfirmSave: vi.fn(),
    handleOpenConflictReview: vi.fn(),
    handleCloseConflictReview: vi.fn(),
    handleKeepLocalVersion: vi.fn(),
    handleReloadServerVersion: vi.fn(),
    handleReloadConfirm: vi.fn(),
    closeReloadConfirm: vi.fn(),
  }),
}))

vi.mock('@/hooks/useWorkspaceParticipants', () => ({
  useWorkspaceParticipants: () => ({
    participants: [],
    participantsLoading: false,
    participantsError: null,
    setParticipants: vi.fn(),
    setParticipantsError: vi.fn(),
    refreshParticipants: vi.fn(),
  }),
}))

vi.mock('@/hooks/useParticipantRevocation', () => ({
  useParticipantRevocation: () => ({
    pendingRevokeParticipant: null,
    revokeLoading: false,
    requestRevokeParticipant: vi.fn(),
    confirmRevokeParticipant: vi.fn(),
    cancelRevokeParticipant: vi.fn(),
  }),
}))

vi.mock('@/hooks/createTaskMutations', () => ({
  createTaskMutations: () => ({
    hasCycle: false,
    onCheckTask: vi.fn(),
    handleAddTask: vi.fn(),
    handleAddSubtask: vi.fn(),
    handleUpdateTask: vi.fn(),
    handleLinkDependency: vi.fn(),
    handleUnlinkDependency: vi.fn(),
    handleReorderTasks: vi.fn(),
    handleReorderSubtasks: vi.fn(),
    handleDeleteSubtask: vi.fn(),
  }),
}))

vi.mock('@/hooks/usePhaseMutations', () => ({
  usePhaseMutations: () => ({
    handleUpdatePhaseColor: vi.fn(),
    handleUpdatePhaseColorMode: vi.fn(),
    handleUpdatePhaseName: vi.fn(),
    handleReorderPhases: vi.fn(),
    handleDeletePhase: vi.fn(),
  }),
}))

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  window.localStorage.clear()
  window.sessionStorage.clear()
  mockIsSample = false
  mockActiveRoadmapId = 'local-123'
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('WorkspaceWelcomeBanner unit tests', () => {
  it('renders welcome message, description, and list of features with proper ARIA attributes', () => {
    const onDismiss = vi.fn()
    const onCreateOwn = vi.fn()
    act(() => {
      root.render(
        <WorkspaceWelcomeBanner onDismiss={onDismiss} onCreateOwn={onCreateOwn} />
      )
    })

    const welcomeElement = container.querySelector('[aria-label="Welcome to RoadForge Onboarding"]')
    expect(welcomeElement).not.toBeNull()
    expect(welcomeElement?.getAttribute('role')).toBe('status')
    expect(container.textContent).toContain('Welcome to RoadForge!')
    expect(container.textContent).toContain('No accounts required')
    expect(container.textContent).toContain('Private local draft')
    expect(container.textContent).toContain('Easy collaboration')
  })

  it('triggers onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn()
    const onCreateOwn = vi.fn()
    act(() => {
      root.render(
        <WorkspaceWelcomeBanner onDismiss={onDismiss} onCreateOwn={onCreateOwn} />
      )
    })

    const dismissBtn = container.querySelector('[aria-label="Dismiss welcome onboarding banner"]') as HTMLButtonElement
    expect(dismissBtn).not.toBeNull()
    act(() => {
      dismissBtn.click()
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('triggers onCreateOwn when Create New Roadmap button is clicked', () => {
    const onDismiss = vi.fn()
    const onCreateOwn = vi.fn()
    act(() => {
      root.render(
        <WorkspaceWelcomeBanner onDismiss={onDismiss} onCreateOwn={onCreateOwn} />
      )
    })

    const createBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Create New Roadmap')
    ) as HTMLButtonElement
    expect(createBtn).not.toBeNull()
    act(() => {
      createBtn.click()
    })
    expect(onCreateOwn).toHaveBeenCalledTimes(1)
  })
})

describe('WorkspaceHead unit tests for Sample Roadmap', () => {
  it('renders Sample Roadmap badge if isSample is true', () => {
    act(() => {
      root.render(
        <WorkspaceHead
          roadmapName="My Test Roadmap"
          totalDone={0}
          totalTasks={0}
          phaseCount={0}
          saved={false}
          nextReadyCount={0}
          isSample={true}
        />
      )
    })

    expect(container.textContent).toContain('Sample Roadmap')
  })

  it('does not render Sample Roadmap badge if isSample is false', () => {
    act(() => {
      root.render(
        <WorkspaceHead
          roadmapName="My Test Roadmap"
          totalDone={0}
          totalTasks={0}
          phaseCount={0}
          saved={false}
          nextReadyCount={0}
          isSample={false}
        />
      )
    })

    expect(container.textContent).not.toContain('Sample Roadmap')
  })
})

describe('Workspace integration tests for onboarding dismissal', () => {
  it('shows welcome banner when onboarding is not dismissed', () => {
    expect(storage.hasDismissedOnboarding()).toBe(false)
    act(() => {
      root.render(<Workspace mode="owner" onCreateOwn={vi.fn()} />)
    })

    expect(container.querySelector('[aria-label="Welcome to RoadForge Onboarding"]')).not.toBeNull()
  })

  it('hides welcome banner when onboarding is dismissed initially', () => {
    storage.setOnboardingDismissed('some-roadmap', true)
    expect(storage.hasDismissedOnboarding()).toBe(true)

    act(() => {
      root.render(<Workspace mode="owner" onCreateOwn={vi.fn()} />)
    })

    expect(container.querySelector('[aria-label="Welcome to RoadForge Onboarding"]')).toBeNull()
  })

  it('dismisses banner, persists the state to localStorage, and updates UI on click of dismiss button', () => {
    act(() => {
      root.render(<Workspace mode="owner" onCreateOwn={vi.fn()} />)
    })

    const dismissBtn = container.querySelector('[aria-label="Dismiss welcome onboarding banner"]') as HTMLButtonElement
    expect(dismissBtn).not.toBeNull()

    act(() => {
      dismissBtn.click()
    })

    // Banner is removed from DOM
    expect(container.querySelector('[aria-label="Welcome to RoadForge Onboarding"]')).toBeNull()
    // Storage has registered onboarding dismissal
    expect(storage.hasDismissedOnboarding()).toBe(true)
    expect(storage.getRoadmapUiState(mockActiveRoadmapId)?.isOnboardingDismissed).toBe(true)
  })

  it('triggers onCreateOwn, dismisses onboarding, and updates storage on click of Create New Roadmap button', () => {
    const onCreateOwnMock = vi.fn()
    act(() => {
      root.render(<Workspace mode="owner" onCreateOwn={onCreateOwnMock} />)
    })

    const createBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Create New Roadmap')
    ) as HTMLButtonElement
    expect(createBtn).not.toBeNull()

    act(() => {
      createBtn.click()
    })

    expect(onCreateOwnMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[aria-label="Welcome to RoadForge Onboarding"]')).toBeNull()
    expect(storage.hasDismissedOnboarding()).toBe(true)
    expect(storage.getRoadmapUiState(mockActiveRoadmapId)?.isOnboardingDismissed).toBe(true)
  })
})
