import canonicalRoadmap from '../../../../docs/roadforge-roadmap.json'
import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'
import type { Phase, TagDefinition } from '@/types/roadmap'

export interface RoadForgeTemplate {
  roadmapName: string
  phases: Phase[]
  tagRegistry: TagDefinition[]
}

// Capture an immutable serialized boundary once. The raw imported object is
// intentionally not exported, so product code can only request a fresh parse.
const canonicalTemplateJson = JSON.stringify(canonicalRoadmap)

export function createRoadForgeTemplate(): RoadForgeTemplate {
  const parsed = parseImportedRoadmapJson(canonicalTemplateJson)
  if (parsed.warnings.length > 0 || parsed.repairs.length > 0) {
    throw new Error('The bundled RoadForge template failed canonical validation.')
  }
  if (!parsed.roadmapName) {
    throw new Error('The bundled RoadForge template is missing its roadmap name.')
  }

  return {
    roadmapName: parsed.roadmapName,
    phases: parsed.phases,
    tagRegistry: parsed.tagRegistry ?? [],
  }
}
