// ─── Merge entity types ────────────────────────────────────────────────────────

export type EntityKind = 'phase' | 'task' | 'tag'

export type ConflictType =
  | 'task-field-conflict'
  | 'tag-registry-conflict'
  | 'id-collision'

export interface TaskFieldDiff {
  field: string
  current: string
  imported: string
}

export interface ImportConflict {
  type: ConflictType
  kind: EntityKind
  importedId: string
  importedTitle?: string
  currentId?: string
  phaseName?: string
  field?: string
  message: string
  fieldDiffs?: TaskFieldDiff[]
}
