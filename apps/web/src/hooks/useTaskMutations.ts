'use client'

import type { Phase, Task, ActivityChange } from '@/types/roadmap'
import { generateTaskId, generateSubtaskId, hasCycle as hasCycleGraph } from '@/lib/task-graph'
import { getTaskCompletionBlocker } from '@/lib/task-completion'
import { getChangedTaskFields } from '@/lib/activity-changes'
import {
  buildTaskDoneActivityChanges,
  buildTaskDonePhases,
  findPhaseForTask,
  isPhaseComplete,
} from './taskMutationHelpers'
import type { PatchTaskUpdates } from '@/services/roadmap-crud.service'

interface PatchSyncedTaskDoneParams {
  task: Task
  done: boolean
  nextPhases: Phase[]
  revertPhases: (taskId: string, done: boolean, phases: Phase[]) => Phase[]
}

interface PatchSyncedTaskParams {
  task: Task
  updates: PatchTaskUpdates
}

interface CreateTaskMutationsParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  serverRoadmapId: string | null
  sessionToken: string | null
  updatedAt: string | null
  addActivity: (change: ActivityChange) => void
  showToast: (msg: string) => void
  setExpandedTaskId: (id: string) => void
  readOnly: boolean
  isTaskDonePatchInFlight: (taskId: string) => boolean
  patchSyncedTaskDone: (params: PatchSyncedTaskDoneParams) => Promise<boolean>
  patchSyncedTask: (params: PatchSyncedTaskParams) => Promise<boolean>
}

export interface TaskMutations {
  hasCycle: (taskId: string, depId: string) => boolean
  onCheckTask: (id: string) => void
  handleAddTask: (phaseId: string, title?: string) => string
  handleAddSubtask: (parentId: string, title: string) => void
  handleDeleteSubtask: (subtaskId: string) => void
  handleUpdateTask: (id: string, updates: Partial<Task>) => Promise<boolean>
  handleLinkDependency: (taskId: string, depId: string) => void
  handleUnlinkDependency: (taskId: string, depId: string) => void
  handleReorderTasks: (phaseId: string, taskIds: string[]) => void
  handleReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
}

export function createTaskMutations({
  phases,
  setPhases,
  setSaved,
  serverRoadmapId,
  sessionToken,
  updatedAt,
  addActivity,
  showToast,
  setExpandedTaskId,
  readOnly,
  isTaskDonePatchInFlight,
  patchSyncedTaskDone,
  patchSyncedTask,
}: CreateTaskMutationsParams): TaskMutations {
  const allTasks = phases.flatMap((p) => p.tasks)

  const hasCycle = (taskId: string, depId: string): boolean =>
    hasCycleGraph(taskId, depId, allTasks)

  const onCheckTask = (id: string) => {
    if (readOnly || isTaskDonePatchInFlight(id)) return

    const task = allTasks.find((t) => t.id === id)
    if (!task) return

    const nextDone = !task.done
    if (nextDone) {
      const blocker = getTaskCompletionBlocker(task, allTasks)
      if (blocker) {
        showToast(blocker)
        return
      }
    }

    const affectedPhase = findPhaseForTask(phases, id)
    const wasPhaseComplete = affectedPhase ? isPhaseComplete(affectedPhase) : false
    const nextPhases = buildTaskDonePhases(id, nextDone, phases)

    if (serverRoadmapId && sessionToken) {
      if (!updatedAt) {
        showToast('Reload the server roadmap before updating tasks.')
        return
      }
      void patchSyncedTaskDone({
        task,
        done: nextDone,
        nextPhases,
        revertPhases: buildTaskDonePhases,
      })
      return
    }

    setPhases(nextPhases)
    buildTaskDoneActivityChanges({
      task,
      affectedPhase,
      wasPhaseComplete,
      nextPhases,
    }).forEach(addActivity)
    setSaved(false)
  }

  const handleAddSubtask = (parentId: string, title: string) => {
    if (readOnly) return
    const parent = allTasks.find((t) => t.id === parentId)
    if (!parent) return

    const newId = generateSubtaskId(parentId, allTasks)
    const newSubtask: Task = {
      id: newId,
      title,
      done: false,
      next: false,
      tags: ['subtask'],
      deps: [],
      desc: '',
      parentId: parentId,
    }

    setPhases(
      phases.map((p) => {
        // Find phase containing the parent
        const parentIdx = p.tasks.findIndex((t) => t.id === parentId)
        if (parentIdx === -1) return p

        const newTasks = [...p.tasks]
        // Insert after parent in flat storage
        newTasks.splice(parentIdx + 1, 0, newSubtask)
        return { ...p, tasks: newTasks }
      }),
    )

    const phase = findPhaseForTask(phases, parentId)
    addActivity({
      action: 'task.created',
      entity_type: 'task',
      entity_id: newId,
      taskId: newId,
      taskTitle: title,
      phaseId: phase?.id,
      phaseName: phase?.name,
      parentId,
    })
    setSaved(false)
  }

  const handleDeleteSubtask = (subtaskId: string) => {
    if (readOnly) return
    const subtask = allTasks.find((t) => t.id === subtaskId)
    if (!subtask?.parentId) return
    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.filter((t) => t.id !== subtaskId && t.parentId !== subtaskId),
      })),
    )
    setSaved(false)
  }

  const handleAddTask = (phaseId: string, title?: string): string => {
    if (readOnly) return ''

    const newId = generateTaskId(allTasks)
    const taskTitle = title?.trim() || 'New task'
    const newTask: Task = {
      id: newId,
      title: taskTitle,
      done: false,
      next: false,
      est: '',
      tags: [],
      deps: [],
      desc: '',
    }

    const phase = phases.find((p) => p.id === phaseId)
    setPhases(
      phases.map((p) => {
        if (p.id !== phaseId) return p
        return { ...p, tasks: [...p.tasks, newTask] }
      }),
    )

    addActivity({
      action: 'task.created',
      entity_type: 'task',
      entity_id: newId,
      taskId: newId,
      taskTitle,
      phaseId: phase?.id,
      phaseName: phase?.name,
    })
    setSaved(false)
    setExpandedTaskId(newId)
    return newId
  }

  const handleUpdateTask = async (
    id: string,
    updates: Partial<Task>,
  ): Promise<boolean> => {
    if (readOnly) return false
    const task = allTasks.find((t) => t.id === id)
    if (!task) return false
    const changedFields = getChangedTaskFields(task, updates)
    if (changedFields.length === 0) return true

    if (serverRoadmapId && sessionToken) {
      if (!updatedAt) {
        showToast('Reload the server roadmap before updating tasks.')
        return false
      }
      const patchUpdates = Object.fromEntries(
        changedFields.map((field) => [field, updates[field]]),
      ) as PatchTaskUpdates
      return patchSyncedTask({ task, updates: patchUpdates })
    }

    const phase = findPhaseForTask(phases, id)
    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      })),
    )
    addActivity({
      action: 'task.updated',
      entity_type: 'task',
      entity_id: id,
      taskId: id,
      taskTitle: updates.title ?? task.title,
      changedFields,
      phaseId: phase?.id,
      phaseName: phase?.name,
    })
    setSaved(false)
    return true
  }

  const handleLinkDependency = (taskId: string, depId: string) => {
    if (readOnly) return
    if (hasCycle(taskId, depId)) {
      showToast('Circular dependency detected')
      return
    }

    const task = allTasks.find((t) => t.id === taskId)
    const depTask = allTasks.find((t) => t.id === depId)

    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => {
          if (t.id !== taskId) return t
          const deps = Array.from(new Set([...(t.deps || []), depId]))
          return { ...t, deps }
        }),
      })),
    )
    const phase = findPhaseForTask(phases, taskId)
    addActivity({
      action: 'task.dependency.linked',
      entity_type: 'task',
      entity_id: taskId,
      taskId,
      taskTitle: task?.title,
      dependencyId: depId,
      dependencyTitle: depTask?.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    })
    setSaved(false)
  }

  const handleUnlinkDependency = (taskId: string, depId: string) => {
    if (readOnly) return
    const task = allTasks.find((t) => t.id === taskId)
    const depTask = allTasks.find((t) => t.id === depId)

    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => {
          if (t.id !== taskId) return t
          const deps = (t.deps || []).filter((id) => id !== depId)
          return { ...t, deps }
        }),
      })),
    )
    const phase = findPhaseForTask(phases, taskId)
    addActivity({
      action: 'task.dependency.unlinked',
      entity_type: 'task',
      entity_id: taskId,
      taskId,
      taskTitle: task?.title,
      dependencyId: depId,
      dependencyTitle: depTask?.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    })
    setSaved(false)
  }

  const handleReorderTasks = (phaseId: string, taskIds: string[]) => {
    if (readOnly) return
    setPhases(
      phases.map((p) => {
        if (p.id !== phaseId) return p
        // Reconstruct the tasks array based on the new order of top-level tasks,
        // but preserve the subtasks correctly under their parents.
        // Actually, since tasks are flat in the phase.tasks array, reordering
        // top-level tasks means we move the parent AND its following subtasks as a block.

        const orderedTasks: Task[] = []
        taskIds.forEach((tid) => {
          const parent = p.tasks.find((t) => t.id === tid)
          if (parent) {
            orderedTasks.push(parent)
            // Add all its subtasks immediately after it
            const subtasks = p.tasks.filter((t) => t.parentId === tid)
            orderedTasks.push(...subtasks)
          }
        })

        // Add any subtasks whose parents weren't in taskIds (shouldn't happen)
        // or top-level tasks that were missed.
        const handledIds = new Set(orderedTasks.map((t) => t.id))
        const remainingTasks = p.tasks.filter((t) => !handledIds.has(t.id))

        return { ...p, tasks: [...orderedTasks, ...remainingTasks] }
      }),
    )
    const phase = phases.find((p) => p.id === phaseId)
    addActivity({
      action: 'task.reordered',
      entity_type: 'phase',
      entity_id: phaseId,
      phaseId,
      phaseName: phase?.name,
    })
    setSaved(false)
  }

  const handleReorderSubtasks = (parentId: string, subtaskIds: string[]) => {
    if (readOnly) return
    const parent = allTasks.find((t) => t.id === parentId)
    setPhases(
      phases.map((p) => {
        const hasParent = p.tasks.some((t) => t.id === parentId)
        if (!hasParent) return p

        const otherTasks = p.tasks.filter((t) => t.parentId !== parentId)
        const orderedSubtasks = subtaskIds
          .map((sid) => p.tasks.find((t) => t.id === sid))
          .filter((t): t is Task => !!t)

        // We need to re-insert the subtasks after the parent in the flat array
        const parentIdx = otherTasks.findIndex((t) => t.id === parentId)
        const newTasks = [...otherTasks]
        newTasks.splice(parentIdx + 1, 0, ...orderedSubtasks)

        return { ...p, tasks: newTasks }
      }),
    )
    const phase = findPhaseForTask(phases, parentId)
    addActivity({
      action: 'task.reordered',
      entity_type: 'task',
      entity_id: parentId,
      taskId: parentId,
      taskTitle: parent?.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    })
    setSaved(false)
  }

  return {
    hasCycle,
    onCheckTask,
    handleAddTask,
    handleAddSubtask,
    handleDeleteSubtask,
    handleUpdateTask,
    handleLinkDependency,
    handleUnlinkDependency,
    handleReorderTasks,
    handleReorderSubtasks,
  }
}
