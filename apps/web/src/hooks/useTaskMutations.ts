'use client'

import type { Phase, Task, ActivityChange } from '@/types/roadmap'
import { generateTaskId, hasCycle as hasCycleGraph } from '@/lib/task-graph'
import { getTaskCompletionBlocker } from '@/lib/task-completion'

interface UseTaskMutationsParams {
  phases: Phase[]
  setPhases: (phases: Phase[]) => void
  setSaved: (saved: boolean) => void
  addActivity: (change: ActivityChange) => void
  showToast: (msg: string) => void
  setExpandedTaskId: (id: string) => void
  readOnly: boolean
}

export interface TaskMutations {
  hasCycle: (taskId: string, depId: string) => boolean
  onCheckTask: (id: string) => void
  handleAddTask: (phaseId: string) => void
  handleAddSubtask: (parentId: string, title: string) => void
  handleUpdateTask: (id: string, updates: Partial<Task>) => void
  handleLinkDependency: (taskId: string, depId: string) => void
  handleUnlinkDependency: (taskId: string, depId: string) => void
  handleReorderTasks: (phaseId: string, taskIds: string[]) => void
  handleReorderSubtasks: (parentId: string, subtaskIds: string[]) => void
}

export function useTaskMutations({
  phases,
  setPhases,
  setSaved,
  addActivity,
  showToast,
  setExpandedTaskId,
  readOnly,
}: UseTaskMutationsParams): TaskMutations {
  const allTasks = phases.flatMap((p) => p.tasks)

  const findPhaseForTask = (taskId: string) =>
    phases.find((phase) => phase.tasks.some((task) => task.id === taskId))

  const isPhaseComplete = (phase: Phase) =>
    phase.tasks.length > 0 && phase.tasks.every((t) => t.done)

  const phaseLabel = (phase: Phase) => `${phase.num} — ${phase.name}`

  const hasCycle = (taskId: string, depId: string): boolean =>
    hasCycleGraph(taskId, depId, allTasks)

  const onCheckTask = (id: string) => {
    if (readOnly) return

    const task = allTasks.find((t) => t.id === id)
    if (!task) return

    // Reopening is always allowed
    if (task.done) {
      const affectedPhase = findPhaseForTask(id)
      const wasPhaseComplete = affectedPhase ? isPhaseComplete(affectedPhase) : false
      const nextPhases = phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: false } : t)),
      }))
      const nextPhase = affectedPhase ? nextPhases.find((p) => p.id === affectedPhase.id) : null
      const isNowPhaseComplete = nextPhase ? isPhaseComplete(nextPhase) : false
      setPhases(nextPhases)
      addActivity({
        action: 'task.reopened',
        entity_type: 'task',
        entity_id: task.id,
        taskId: task.id,
        taskTitle: task.title,
        phaseId: affectedPhase?.id,
        phaseName: affectedPhase?.name,
      })
      if (affectedPhase && wasPhaseComplete && !isNowPhaseComplete) {
        addActivity({
          action: 'phase.reopened',
          entity_type: 'phase',
          entity_id: affectedPhase.id,
          phaseId: affectedPhase.id,
          phaseName: affectedPhase.name,
          phaseNum: affectedPhase.num,
          details: phaseLabel(affectedPhase),
        })
      }
      setSaved(false)
      return
    }

    // ─── Completion Guard ────────────────────────────────────────────────────

    const blocker = getTaskCompletionBlocker(task, allTasks)
    if (blocker) {
      showToast(blocker)
      return
    }

    const affectedPhase = findPhaseForTask(id)
    const wasPhaseComplete = affectedPhase ? isPhaseComplete(affectedPhase) : false
    const nextPhases = phases.map((p) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: true } : t)),
    }))
    const nextPhase = affectedPhase ? nextPhases.find((p) => p.id === affectedPhase.id) : null
    const isNowPhaseComplete = nextPhase ? isPhaseComplete(nextPhase) : false
    setPhases(nextPhases)
    addActivity({
      action: 'task.completed',
      entity_type: 'task',
      entity_id: task.id,
      taskId: task.id,
      taskTitle: task.title,
      phaseId: affectedPhase?.id,
      phaseName: affectedPhase?.name,
    })
    if (affectedPhase && !wasPhaseComplete && isNowPhaseComplete) {
      addActivity({
        action: 'phase.completed',
        entity_type: 'phase',
        entity_id: affectedPhase.id,
        phaseId: affectedPhase.id,
        phaseName: affectedPhase.name,
        phaseNum: affectedPhase.num,
        details: phaseLabel(affectedPhase),
      })
    }
    setSaved(false)
  }

  const handleAddSubtask = (parentId: string, title: string) => {
    if (readOnly) return
    const parent = allTasks.find((t) => t.id === parentId)
    if (!parent) return

    const newId = generateTaskId(allTasks)
    const newSubtask: Task = {
      id: newId,
      title,
      done: false,
      next: false,
      tags: ['subtask'],
      deps: [],
      desc: `Subtask of ${parent.id} — ${parent.title}`,
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

    const phase = findPhaseForTask(parentId)
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
    setExpandedTaskId(newId)
  }

  const handleAddTask = (phaseId: string) => {
    if (readOnly) return

    const newId = generateTaskId(allTasks)
    const newTask: Task = {
      id: newId,
      title: 'New task',
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
      taskTitle: newTask.title,
      phaseId: phase?.id,
      phaseName: phase?.name,
    })
    setSaved(false)
    setExpandedTaskId(newId)
  }

  const handleUpdateTask = (id: string, updates: Partial<Task>) => {
    if (readOnly) return
    const task = allTasks.find((t) => t.id === id)
    const phase = findPhaseForTask(id)
    setPhases(
      phases.map((p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      })),
    )
    if (task) {
      addActivity({
        action: 'task.updated',
        entity_type: 'task',
        entity_id: id,
        taskId: id,
        taskTitle: updates.title ?? task.title,
        phaseId: phase?.id,
        phaseName: phase?.name,
      })
    }
    setSaved(false)
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
    const phase = findPhaseForTask(taskId)
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
    const phase = findPhaseForTask(taskId)
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
    const phase = findPhaseForTask(parentId)
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
    handleUpdateTask,
    handleLinkDependency,
    handleUnlinkDependency,
    handleReorderTasks,
    handleReorderSubtasks,
  }
}
