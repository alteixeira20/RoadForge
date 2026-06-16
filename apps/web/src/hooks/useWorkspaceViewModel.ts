import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { usePhaseCollapse } from '@/hooks/usePhaseCollapse'
import { dedupeNames, getTaskAssignees, getVisibleTaskTags } from '@/lib/task-assignment'
import {
  DEFAULT_FILTER_STATE,
  filterTasks,
  isFilterStateActive,
} from '@/lib/task-filters'
import type {
  FilterState,
  Participant,
  Phase,
  ShareRole,
  TagDefinition,
  WorkspaceView,
} from '@/types/roadmap'

interface UseWorkspaceViewModelParams {
  phases: Phase[]
  tagRegistry: TagDefinition[]
  participants: Participant[]
  displayName: string
  participantId: string | null
  role: ShareRole | null
  serverRoadmapId: string | null
  sessionToken: string | null
  activeRoadmapId: string | null
}

const FILTER_STORAGE_PREFIX = 'anvilary:filters:'

function filterStorageKey(roadmapId: string | null): string {
  return `${FILTER_STORAGE_PREFIX}${roadmapId ?? 'local'}`
}

function readStoredFilters(roadmapId: string | null): FilterState {
  if (typeof window === 'undefined') return DEFAULT_FILTER_STATE
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(filterStorageKey(roadmapId)) ?? '{}',
    ) as Partial<FilterState>
    return {
      ...DEFAULT_FILTER_STATE,
      ...value,
      query: '',
      assignees: Array.isArray(value.assignees) ? value.assignees : [],
      tags: Array.isArray(value.tags) ? value.tags : [],
      phaseIds: Array.isArray(value.phaseIds) ? value.phaseIds : [],
    }
  } catch {
    return DEFAULT_FILTER_STATE
  }
}

export function useWorkspaceViewModel({
  phases,
  tagRegistry,
  participants,
  displayName,
  participantId,
  role,
  serverRoadmapId,
  sessionToken,
  activeRoadmapId,
}: UseWorkspaceViewModelParams) {
  const collapse = usePhaseCollapse(phases, activeRoadmapId)
  const [filterState, setFilterState] = useState<FilterState>(() =>
    readStoredFilters(activeRoadmapId),
  )
  const [filterRoadmapId, setFilterRoadmapId] = useState(activeRoadmapId)
  const [workspaceView, setWorkspaceViewState] = useState<WorkspaceView>('roadmap')
  const deferredQuery = useDeferredValue(filterState.query)

  const allTasks = useMemo(() => phases.flatMap((phase) => phase.tasks), [phases])
  const totalDone = allTasks.filter((task) => task.done).length
  const nextReadyCount = allTasks.filter((task) => task.next && !task.done).length
  const canViewTeam = role === 'owner' && Boolean(serverRoadmapId && sessionToken)

  useEffect(() => {
    setFilterState(readStoredFilters(activeRoadmapId))
    setFilterRoadmapId(activeRoadmapId)
  }, [activeRoadmapId])

  useEffect(() => {
    if (typeof window === 'undefined' || filterRoadmapId !== activeRoadmapId) return
    const persisted = { ...filterState, query: '' }
    window.sessionStorage.setItem(
      filterStorageKey(activeRoadmapId),
      JSON.stringify(persisted),
    )
  }, [activeRoadmapId, filterRoadmapId, filterState])

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

  const tagIds = useMemo(() => (
    [...new Set([
      ...tagRegistry.map((tag) => tag.id),
      ...allTasks.flatMap((task) => getVisibleTaskTags(task)),
    ])]
  ), [allTasks, tagRegistry])

  const tagLabels = useMemo(() => new Map(
    tagRegistry.map((tag) => [tag.id, tag.label]),
  ), [tagRegistry])

  const phaseOptions = useMemo(() => phases.map((phase) => ({
    id: phase.id,
    label: `${phase.num} ${phase.name}`,
  })), [phases])

  const visiblePhases = useMemo(() => filterTasks(
    phases,
    { ...filterState, query: deferredQuery },
    { displayName, participantId, tagLabels },
  ), [deferredQuery, displayName, filterState, participantId, phases, tagLabels])

  const isFiltering = isFilterStateActive(filterState)
  const effectiveOpenPhases = isFiltering
    ? visiblePhases.map((phase) => phase.id)
    : collapse.openPhases

  const setFilterField = useCallback(<K extends keyof FilterState>(
    field: K,
    value: FilterState[K],
  ) => {
    setFilterState((current) => ({ ...current, [field]: value }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilterState(DEFAULT_FILTER_STATE)
  }, [])

  const taskEditorAssigneeNames = useMemo(() => (
    dedupeNames([
      ...participants.filter((participant) => !participant.revokedAt)
        .map((participant) => participant.displayName),
      ...assignmentNames,
      displayName,
    ]).sort((a, b) => a.localeCompare(b))
  ), [assignmentNames, displayName, participants])

  return {
    allTasks,
    totalDone,
    nextReadyCount,
    canViewTeam,
    filterState,
    setFilterField,
    clearFilters,
    assignmentNames,
    tagIds,
    tagLabels,
    phaseOptions,
    workspaceView,
    setWorkspaceView,
    visiblePhases,
    isFiltering,
    effectiveOpenPhases,
    ...collapse,
    taskEditorAssigneeNames,
  }
}
