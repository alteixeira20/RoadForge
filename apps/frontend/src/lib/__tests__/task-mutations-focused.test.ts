import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTaskMutations } from '@/hooks/useTaskMutations'
import type { ActivityChange, Phase, Task } from '@/types/roadmap'

const REVISION_BEFORE = '2026-08-14T09:00:00Z'
const REVISION_AFTER_CREATE = '2026-08-14T09:01:00Z'
const UUID = '11111111-1111-4111-8111-111111111111'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

function basePhases(): Phase[] {
  return [{
    id: 'phase-1',
    num: '01',
    name: 'Build',
    color: '#f97316',
    status: 'active',
    progress: 0,
    tasks: [],
  }]
}

function createFocusedHarness(readiness: Promise<'ready' | 'absent' | 'uncertain'>) {
  let currentPhases = basePhases()
  const setPhases = vi.fn((next: Phase[]) => { currentPhases = next })
  const setSaved = vi.fn()
  const addActivity = vi.fn<(change: ActivityChange) => void>()
  const patchSyncedTask = vi.fn(async () => true)
  const patchSyncedTaskDone = vi.fn(async () => true)
  const taskStructure = {
    createSyncedTask: vi.fn((phaseId: string, task: Task) => {
      currentPhases = currentPhases.map((phase) => (
        phase.id === phaseId ? { ...phase, tasks: [...phase.tasks, task] } : phase
      ))
      setPhases(currentPhases)
      return true
    }),
    deleteSyncedTask: vi.fn(() => true),
    reorderSyncedTasks: vi.fn(() => true),
    reorderSyncedSubtasks: vi.fn(() => true),
    setSyncedDependency: vi.fn(() => true),
    waitForTaskReady: vi.fn(() => readiness),
    getLatestServerRevision: vi.fn(() => REVISION_AFTER_CREATE),
  }
  const mutations = createTaskMutations({
    phases: currentPhases,
    setPhases,
    setSaved,
    serverRoadmapId: 'rm_1',
    sessionToken: 'session-token',
    updatedAt: REVISION_BEFORE,
    addActivity,
    showToast: vi.fn(),
    setExpandedTaskId: vi.fn(),
    readOnly: false,
    isTaskDonePatchInFlight: vi.fn(() => false),
    patchSyncedTaskDone,
    patchSyncedTask,
    taskStructure,
    getCurrentPhases: () => currentPhases,
  })
  return {
    mutations,
    taskStructure,
    patchSyncedTask,
    patchSyncedTaskDone,
    setSaved,
    addActivity,
    get phases() { return currentPhases },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('focused task mutation integration', () => {
  it('waits for create before a field patch and uses the post-create revision', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID)
    const readiness = deferred<'ready' | 'absent' | 'uncertain'>()
    const harness = createFocusedHarness(readiness.promise)

    const taskId = harness.mutations.handleAddTask('phase-1')
    const update = harness.mutations.handleUpdateTask(taskId, { title: 'Renamed immediately' })

    expect(taskId).toBe(`rf-t-${UUID}`)
    expect(harness.patchSyncedTask).not.toHaveBeenCalled()

    readiness.resolve('ready')
    await expect(update).resolves.toBe(true)

    expect(harness.patchSyncedTask).toHaveBeenCalledWith(expect.objectContaining({
      task: expect.objectContaining({ id: taskId, title: 'New task' }),
      updates: { title: 'Renamed immediately' },
      lastUpdatedAt: REVISION_AFTER_CREATE,
    }))
    expect(harness.addActivity).not.toHaveBeenCalled()
  })

  it('waits for create before completion and uses the post-create revision', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID)
    const readiness = deferred<'ready' | 'absent' | 'uncertain'>()
    const harness = createFocusedHarness(readiness.promise)

    const taskId = harness.mutations.handleAddTask('phase-1')
    harness.mutations.onCheckTask(taskId)
    await Promise.resolve()
    expect(harness.patchSyncedTaskDone).not.toHaveBeenCalled()

    readiness.resolve('ready')
    await vi.waitFor(() => expect(harness.patchSyncedTaskDone).toHaveBeenCalledTimes(1))

    expect(harness.patchSyncedTaskDone).toHaveBeenCalledWith(expect.objectContaining({
      task: expect.objectContaining({ id: taskId, done: false }),
      done: true,
      lastUpdatedAt: REVISION_AFTER_CREATE,
    }))
  })

  it('keeps an immediate field edit local when create outcome is uncertain', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID)
    const harness = createFocusedHarness(Promise.resolve('uncertain'))

    const taskId = harness.mutations.handleAddTask('phase-1')
    await expect(harness.mutations.handleUpdateTask(taskId, {
      title: 'Preserved local draft',
    })).resolves.toBe(true)

    expect(harness.patchSyncedTask).not.toHaveBeenCalled()
    expect(harness.phases[0].tasks[0].title).toBe('Preserved local draft')
    expect(harness.setSaved).toHaveBeenCalledWith(false)
    expect(harness.addActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: 'task.updated',
      taskId,
      changedFields: ['title'],
    }))
  })

  it('cancels immediate follow-up writes when create is definitively absent', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(UUID)
    const harness = createFocusedHarness(Promise.resolve('absent'))

    const taskId = harness.mutations.handleAddTask('phase-1')
    await expect(harness.mutations.handleUpdateTask(taskId, {
      title: 'Should not patch',
    })).resolves.toBe(false)
    harness.mutations.onCheckTask(taskId)
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.patchSyncedTask).not.toHaveBeenCalled()
    expect(harness.patchSyncedTaskDone).not.toHaveBeenCalled()
  })
})
