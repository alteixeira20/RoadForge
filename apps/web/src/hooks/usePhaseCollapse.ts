import { useEffect, useRef, useState } from 'react'
import type { Phase } from '@/types/roadmap'

type PhaseCollapseDefault = Pick<Phase, 'id' | 'status'>
type PhaseCollapseDefaultTuple = [id: string, status: Phase['status']]

function getDefaultOpenPhaseIds(phases: PhaseCollapseDefault[]) {
  const activePhaseIds = phases.filter((phase) => phase.status === 'active').map((phase) => phase.id)
  if (activePhaseIds.length > 0) return activePhaseIds

  const nextPhaseIds = phases.filter((phase) => phase.status === 'next').map((phase) => phase.id)
  if (nextPhaseIds.length > 0) return nextPhaseIds

  return phases[0] ? [phases[0].id] : []
}

export function usePhaseCollapse(phases: Phase[]) {
  const [openPhases, setOpenPhases] = useState<string[]>(() => getDefaultOpenPhaseIds(phases))
  const phaseIdsKey = JSON.stringify(phases.map((phase) => phase.id))
  const phaseDefaultsKey = JSON.stringify(
    phases.map(({ id, status }) => [id, status] as PhaseCollapseDefaultTuple),
  )
  const previousPhaseIdsKey = useRef(phaseIdsKey)

  useEffect(() => {
    const phaseIdsChanged = previousPhaseIdsKey.current !== phaseIdsKey
    previousPhaseIdsKey.current = phaseIdsKey
    const phaseDefaults = (JSON.parse(phaseDefaultsKey) as PhaseCollapseDefaultTuple[])
      .map(([id, status]) => ({ id, status }))

    setOpenPhases((prev) => {
      const phaseIds = new Set(phaseDefaults.map((phase) => phase.id))
      const validOpenPhases = prev.filter((id) => phaseIds.has(id))

      if (validOpenPhases.length > 0) {
        return validOpenPhases.length === prev.length ? prev : validOpenPhases
      }
      if (prev.length > 0) return validOpenPhases
      if (!phaseIdsChanged) return prev
      return getDefaultOpenPhaseIds(phaseDefaults)
    })
  }, [phaseDefaultsKey, phaseIdsKey])

  const togglePhase = (id: string) =>
    setOpenPhases((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const allOpen = openPhases.length === phases.length
  const collapseAll = () => setOpenPhases([])
  const expandAll = () => setOpenPhases(phases.map((p) => p.id))

  return { openPhases, togglePhase, allOpen, collapseAll, expandAll }
}
