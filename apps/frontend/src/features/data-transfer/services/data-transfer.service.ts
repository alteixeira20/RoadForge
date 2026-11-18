import type { Roadmap, Phase, ShareRole, TagDefinition, ExportFormat } from '@/shared/types/roadmap'
import { parseImportedRoadmapJson } from '@/features/roadmaps/lib/roadmap-validation'
import { PORTABLE_ROADMAP_SCHEMA_VERSION, toPortablePhases } from '@/features/roadmaps/lib/portable-roadmap'
import { normalizePhasesProgress } from '@/shared/domain/phase-progress'
import { upgradeRoadmapSnapshot } from '@/features/roadmaps/lib/roadmap-upgrade'
import { ensureRegistryForTagIds } from '@/features/tags/lib/tag-registry'

export async function exportRoadmap(
  phases: Phase[],
  format: ExportFormat,
  metadata: {
    roadmapName?: string
    ownerDisplayName?: string | null
    updatedAt?: string | null
    saved?: boolean
    serverRoadmapId?: string | null
    role?: ShareRole | null
    tagRegistry?: TagDefinition[]
  } = {},
): Promise<Blob> {
  const upgraded = upgradeRoadmapSnapshot({ roadmapName: metadata.roadmapName, phases })
  const json = JSON.stringify(buildRoadmapExport(normalizePhasesProgress(upgraded.phases), metadata), null, 2)
  return new Blob([json], { type: 'application/json' })
}

function buildRoadmapExport(
  phases: Phase[],
  metadata: {
    roadmapName?: string
    ownerDisplayName?: string | null
    updatedAt?: string | null
    saved?: boolean
    serverRoadmapId?: string | null
    role?: ShareRole | null
    tagRegistry?: TagDefinition[]
  },
) {
  const usedTagIds = phases.flatMap((phase) =>
    phase.tasks.flatMap((task) => task.tags ?? []),
  )
  const exportRegistry = ensureRegistryForTagIds(
    usedTagIds,
    metadata.tagRegistry ?? [],
  )
  return {
    schema: 'roadforge.roadmap.export',
    version: PORTABLE_ROADMAP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    roadmap: {
      name: metadata.roadmapName || 'Untitled Roadmap',
      saved: !!metadata.saved,
      id: metadata.serverRoadmapId ?? null,
      updatedAt: metadata.updatedAt ?? null,
    },
    collaborator: {
      role: metadata.role ?? null,
      ownerDisplayName: metadata.ownerDisplayName ?? null,
    },
    meta: {
      phaseCount: phases.length,
      taskCount: phases.reduce((sum, p) => sum + p.tasks.length, 0),
    },
    tagRegistry: exportRegistry,
    phases: toPortablePhases(phases),
  }
}


export async function importRoadmap(
  data: string,
  _format: 'json',
): Promise<Phase[]> {
  const imported = parseImportedRoadmapJson(data)
  return upgradeRoadmapSnapshot({ roadmapName: imported.roadmapName, phases: imported.phases }).phases
}
