export type TaskServerReadiness = 'ready' | 'absent' | 'uncertain'

interface PendingCreation {
  promise: Promise<TaskServerReadiness>
}

const pendingCreations = new Map<string, PendingCreation>()

/**
 * Register one tab-local pending task creation.
 *
 * Only newly-created shared interactive task IDs enter this registry. Those IDs are
 * collision-resistant, and entries exist only while the focused create request is
 * unresolved. No roadmap payload, credential, or durable state is stored here.
 */
export function registerPendingTaskCreation(
  taskId: string,
  promise: Promise<TaskServerReadiness>,
): void {
  pendingCreations.set(taskId, { promise })
}

export function unregisterPendingTaskCreation(
  taskId: string,
  promise: Promise<TaskServerReadiness>,
): void {
  if (pendingCreations.get(taskId)?.promise === promise) {
    pendingCreations.delete(taskId)
  }
}

/**
 * Wait for a task create that originated in this browser tab.
 * Existing/server-loaded tasks have no pending entry and are immediately ready.
 */
export function waitForPendingTaskCreation(taskId: string): Promise<TaskServerReadiness> {
  return pendingCreations.get(taskId)?.promise ?? Promise.resolve('ready')
}

/** Test-only reset to prevent cross-test module state. */
export function resetPendingTaskCreationsForTests(): void {
  pendingCreations.clear()
}
