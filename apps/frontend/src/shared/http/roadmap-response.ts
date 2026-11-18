import type { Roadmap, Phase, TagDefinition } from '@/shared/types/roadmap'

export interface ApiRoadmapResponse {
  id: string
  name: string
  owner_display_name: string
  schema_version: string
  phases: Phase[]
  tag_registry?: TagDefinition[] | null
  is_password_enabled: boolean
  created_at: string
  updated_at: string
}

export function toRoadmap(r: ApiRoadmapResponse): Roadmap {
  return {
    project: { id: r.id, name: r.name },
    roadmap: { id: r.id, name: r.name, isPasswordEnabled: r.is_password_enabled },
    phases: r.phases,
    tagRegistry: r.tag_registry ?? undefined,
    ownerDisplayName: r.owner_display_name,
    updatedAt: r.updated_at,
  }
}
