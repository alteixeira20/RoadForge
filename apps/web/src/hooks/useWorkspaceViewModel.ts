import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePhaseCollapse } from '@/hooks/usePhaseCollapse'
import { usePhaseSearch } from '@/hooks/usePhaseSearch'
import { dedupeNames, getTaskAssignees, getVisibleTaskTags, taskMatchesAssignee } from '@/lib/task-assignment'
import type { Participant, Phase, ShareRole, Task, TaskFilter, WorkspaceView } from '@/types/roadmap'

interface UseWorkspaceViewModelParams {
  phases: Phase[]
  participants: Participant[]
  displayName: string
  role: ShareRole | null
  serverRoadmapId: string | null
  sessionToken: string | null
  activeRoadmapId: string | null
}

const normalizeFilterValue = (value: string) => value.trim().toLowerCase()

const taskMatchesFilter = (task: Task, filter: TaskFilter, displayName: string) => {
  if (filter === 'all') return true
  if (filter === 'mine') return taskMatchesAssignee(task, displayName)
  if (filter === 'pair') return getVisibleTaskTags(task).map(normalizeFilterValue).includes('pair')
  if (filter === 'next') return task.next === true
  if (filter === 'open') return task.done === false
  if (filter === 'done') return task.done === true
  if (filter.startsWith('person:')) return taskMatchesAssignee(task, filter.slice('person:'.length))
  return true
}

export function useWorkspaceViewModel({
  phases,
  participants,
  displayName,
  role,
  serverRoadmapId,
  sessionToken,
  activeRoadmapId,
}: UseWorkspaceViewModelParams) {
  const { openPhases, togglePhase, allOpen, collapseAll, expandAll } = usePhaseCollapse(phases, activeRoadmapId)
  const { searchQuery, setSearchQuery, filteredPhases } = usePhaseSearch(phases)
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all')
  const [workspaceView, setWorkspaceViewState] = useState<WorkspaceView>('roadmap')

  const allTasks = useMemo(() => phases.flatMap((p) => p.tasks), [phases])
  const totalDone = allTasks.filter((t) => t.done).length
  const nextReadyCount = allTasks.filter((t) => t.next && !t.done).length
  const canViewTeam = role === 'owner' && !!serverRoadmapId && !!sessionToken

  useEffect(() => {
    if (!canViewTeam && workspaceView === 'team') setWorkspaceViewState('roadmap')
  }, [canViewTeam, workspaceView])

  const setWorkspaceView = useCallback((view: WorkspaceView) => {
    setWorkspaceViewState(view === 'team' && !canViewTeam ? 'roadmap' : view)
  }, [canViewTeam])

  const assignmentNames = useMemo(() => (
    dedupeNames(allTasks.flatMap((task) => getTaskAssignees(task)))
      .sort((a, b) => a.localeCompare(b))
  ), [allTasks])

  const taskEditorAssigneeNames = useMemo(() => (
    dedupeNames([
      ...participants.filter((p) => !p.revokedAt).map((p) => p.displayName),
      ...assignmentNames,
      displayName,
    ]).sort((a, b) => a.localeCompare(b))
  ), [participants, assignmentNames, displayName])

  const peopleFilterOptions = useMemo(() => {
    return assignmentNames.map((person) => ({
      value: `person:${person}` as TaskFilter,
      label: person,
    }))
  }, [assignmentNames])

  useEffect(() => {
    if (!taskFilter.startsWith('person:')) return
    const selectedName = taskFilter.slice('person:'.length).toLowerCase()
    const stillExists = assignmentNames.some((name) => name.toLowerCase() === selectedName)
    if (!stillExists) setTaskFilter('all')
  }, [assignmentNames, taskFilter])

  const taskFilterOptions = useMemo(() => ([
    { value: 'all' as TaskFilter, label: 'All' },
    { value: 'mine' as TaskFilter, label: 'My tasks' },
    ...peopleFilterOptions,
    { value: 'pair' as TaskFilter, label: 'Pair' },
    { value: 'next' as TaskFilter, label: 'Recommended' },
    { value: 'open' as TaskFilter, label: 'Open' },
    { value: 'done' as TaskFilter, label: 'Done' },
  ]), [peopleFilterOptions])

  const visiblePhases = useMemo(() => {
    if (taskFilter === 'all') return filteredPhases
    return filteredPhases
      .map((phase) => ({
        ...phase,
        tasks: phase.tasks.filter((task) => taskMatchesFilter(task, taskFilter, displayName)),
      }))
      .filter((phase) => phase.tasks.length > 0)
  }, [filteredPhases, taskFilter, displayName])

  const isFiltering = searchQuery.trim().length > 0 || taskFilter !== 'all'
  const effectiveOpenPhases = isFiltering ? visiblePhases.map((phase) => phase.id) : openPhases

  return {
    allTasks,
    totalDone,
    nextReadyCount,
    canViewTeam,
    searchQuery,
    setSearchQuery,
    taskFilter,
    setTaskFilter,
    taskFilterOptions,
    workspaceView,
    setWorkspaceView,
    visiblePhases,
    isFiltering,
    effectiveOpenPhases,
    openPhases,
    togglePhase,
    allOpen,
    collapseAll,
    expandAll,
    taskEditorAssigneeNames,
  }
}
