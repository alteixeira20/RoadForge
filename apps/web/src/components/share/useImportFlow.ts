'use client'

import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { parseImportedRoadmapJson, IMPORT_MAX_BYTES } from '@/lib/roadmap-validation'
import type { ImportedRoadmap } from '@/lib/roadmap-validation'
import { upgradeRoadmapSnapshot } from '@/lib/roadmap-upgrade'
import type { Phase, TagDefinition } from '@/types/roadmap'
import type { ImportMode, PendingImport } from '@/lib/import-merge/types'
import { applySafeAdditions } from '@/lib/import-merge/mergeRoadmaps'
import { buildBasicPreview } from '@/lib/import-merge/previewImport'
import { buildRegistryFromPhases } from '@/lib/tag-registry'

interface UseImportFlowOptions {
  roadmapName: string
  phases: Phase[]
  tagRegistry: TagDefinition[]
  canReplaceCurrent: boolean
  serverRoadmapId: string | null
  setPhases: (phases: Phase[]) => void
  setRoadmapName: (name: string) => void
  setSaved: (saved: boolean) => void
  setTagRegistry?: (registry: TagDefinition[]) => void
  createLocalRoadmap: (
    name: string,
    phases: Phase[],
    tagRegistry?: TagDefinition[],
  ) => string
  onRoadmapImported?: (roadmapName: string | undefined, phases: Phase[]) => void
  onClose: () => void
  onToast: (msg: string) => void
}

function updateUrlForLocalRoadmap(roadmapId: string): void {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', `/workspace?roadmap=${encodeURIComponent(roadmapId)}`)
}

export function useImportFlow({
  roadmapName,
  phases,
  tagRegistry,
  canReplaceCurrent,
  serverRoadmapId,
  setPhases,
  setRoadmapName,
  setSaved,
  setTagRegistry,
  createLocalRoadmap,
  onRoadmapImported,
  onClose,
  onToast,
}: UseImportFlowOptions) {
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importModeRef = useRef<ImportMode>('replace-current')

  const selectImportFile = useCallback((mode: ImportMode) => {
    importModeRef.current = mode
    onToast('Choose a RoadForge JSON file to preview.')
    fileInputRef.current?.click()
  }, [onToast])

  const handleCancelPendingImport = useCallback(() => {
    setPendingImport(null)
  }, [])

  const executeImport = useCallback((imported: ImportedRoadmap, mode: ImportMode) => {
    const nextName = imported.roadmapName || roadmapName
    const importedRegistry = imported.tagRegistry ?? buildRegistryFromPhases(imported.phases)
    if (mode === 'replace-current') {
      if (!canReplaceCurrent) {
        onToast('Viewers can import as a new local roadmap only.')
        return
      }
      setPhases(imported.phases)
      if (imported.roadmapName) setRoadmapName(imported.roadmapName)
      if (setTagRegistry) setTagRegistry(importedRegistry)
      setSaved(false)
      onToast(serverRoadmapId ? 'Roadmap replaced — syncing after autosave' : 'Roadmap replaced from JSON')
    } else {
      const newId = createLocalRoadmap(nextName, imported.phases, importedRegistry)
      updateUrlForLocalRoadmap(newId)
      onToast('Imported as new local roadmap')
    }
    onRoadmapImported?.(imported.roadmapName, imported.phases)
    onClose()
  }, [roadmapName, canReplaceCurrent, setPhases, setRoadmapName, setSaved, setTagRegistry,
      serverRoadmapId, createLocalRoadmap, onRoadmapImported, onClose, onToast])

  const applySafeAdditionsImport = useCallback((pending: PendingImport) => {
    const { mergedPhases, mergePreview } = pending
    if (!mergedPhases) return
    setPhases(mergedPhases)
    if (setTagRegistry && pending.mergedTagRegistry) {
      setTagRegistry(pending.mergedTagRegistry)
    }
    setSaved(false)
    const pCount = mergePreview?.phasesAdded ?? 0
    const tCount = mergePreview?.tasksAdded ?? 0
    if (pCount === 0 && tCount === 0) {
      onToast('No new content to merge — roadmap unchanged.')
    } else {
      const parts: string[] = []
      if (pCount > 0) parts.push(`${pCount} phase${pCount !== 1 ? 's' : ''}`)
      if (tCount > 0) parts.push(`${tCount} task${tCount !== 1 ? 's' : ''}`)
      onToast(`Merged safe additions: ${parts.join(' and ')} added.`)
    }
    onRoadmapImported?.(undefined, mergedPhases)
    onClose()
  }, [setPhases, setSaved, setTagRegistry, onToast, onRoadmapImported, onClose])

  const handleImportFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > IMPORT_MAX_BYTES) {
      onToast('Import failed — file is too large')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseImportedRoadmapJson(ev.target?.result as string)
        const upgraded = upgradeRoadmapSnapshot({
          roadmapName: parsed.roadmapName,
          phases: parsed.phases,
        })
        const imported: ImportedRoadmap = {
          ...parsed,
          roadmapName: upgraded.roadmapName || parsed.roadmapName,
          phases: upgraded.phases,
        }
        const mode = importModeRef.current

        let mergedPhases: Phase[] | undefined
        let mergePreview: PendingImport['mergePreview'] = buildBasicPreview(imported, upgraded.notices)
        let currentStats: PendingImport['currentStats']

        let mergedTagRegistry: TagDefinition[] | undefined
        if (mode === 'safe-additions') {
          const importedRegistry = imported.tagRegistry ?? buildRegistryFromPhases(imported.phases)
          const mergeResult = applySafeAdditions(phases, imported.phases, tagRegistry, importedRegistry)
          mergedPhases = mergeResult.phases
          mergedTagRegistry = mergeResult.tagRegistry
          mergePreview = {
            ...mergeResult.preview,
            repairsCount: imported.repairs.length,
            warningsCount: imported.warnings.length + upgraded.notices.length,
          }
        }

        if (mode === 'replace-current') {
          currentStats = {
            phaseCount: phases.length,
            taskCount: phases.reduce((sum, p) => sum + p.tasks.length, 0),
          }
        }

        // Always show preview before applying (task 2007)
        setPendingImport({
          result: imported,
          mode,
          upgradeNotices: upgraded.notices,
          replaceScope: serverRoadmapId ? 'synced' : 'local',
          mergedPhases,
          mergedTagRegistry,
          mergePreview,
          currentStats,
        })
      } catch (err) {
        onToast(err instanceof Error ? err.message : 'Import failed: invalid roadmap file.')
      }
    }
    reader.readAsText(file)
    // reset so the same file can be re-selected
    e.target.value = ''
  }, [phases, tagRegistry, serverRoadmapId, onToast])

  const handleConfirm = useCallback(() => {
    if (!pendingImport) return
    const p = pendingImport
    setPendingImport(null)
    if (p.mode === 'safe-additions') {
      applySafeAdditionsImport(p)
    } else {
      executeImport(p.result, p.mode)
    }
  }, [pendingImport, applySafeAdditionsImport, executeImport])

  return {
    fileInputRef,
    pendingImport,
    selectImportFile,
    handleImportFile,
    handleConfirm,
    handleCancelPendingImport,
  }
}
