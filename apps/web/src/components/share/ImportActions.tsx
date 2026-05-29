import { Icon } from '@/components/ui/Icon'
import type { ImportMode } from '@/lib/import-merge/types'

interface ImportActionsProps {
  canReplaceCurrent: boolean
  serverRoadmapId: string | null
  onSelectImportFile: (mode: ImportMode) => void
}

export function ImportActions({
  canReplaceCurrent,
  serverRoadmapId,
  onSelectImportFile,
}: ImportActionsProps) {
  return (
    <div className="io-actions">
      <button
        type="button"
        className="io-action primary"
        onClick={() => onSelectImportFile('new-local')}
        aria-label="Import as new local roadmap"
      >
        <span className="io-action-icon">
          <Icon name="plus" size={15} />
        </span>
        <span className="io-action-copy">
          <span className="io-action-title">Import as new local roadmap</span>
          <span className="io-action-desc">
            Safer option: create and activate a separate local draft.
            Collaborators are not affected.
          </span>
          <span className="io-action-note">
            Keeps your current roadmap unchanged.
          </span>
        </span>
        <span className="io-action-go" aria-hidden>
          <Icon name="arrow-right" size={15} />
        </span>
      </button>

      <button
        type="button"
        className="io-action"
        onClick={() => onSelectImportFile('safe-additions')}
        aria-label="Merge safe additions from JSON"
      >
        <span className="io-action-icon">
          <Icon name="import" size={15} />
        </span>
        <span className="io-action-copy">
          <span className="io-action-title">Merge safe additions</span>
          <span className="io-action-desc">
            Add new phases and tasks from a JSON file without touching existing content.
          </span>
          <span className="io-action-note">
            Requires confirmation. Never overwrites existing phases or tasks.
          </span>
        </span>
        <span className="io-action-go" aria-hidden>
          <Icon name="arrow-right" size={15} />
        </span>
      </button>

      <button
        type="button"
        className="io-action destructive"
        onClick={() => onSelectImportFile('replace-current')}
        disabled={!canReplaceCurrent}
        aria-label="Replace current roadmap from JSON"
      >
        <span className="io-action-icon">
          <Icon name="import" size={15} />
        </span>
        <span className="io-action-copy">
          <span className="io-action-title">Replace current roadmap</span>
          <span className="io-action-desc">
            {serverRoadmapId
              ? 'Destructive: overwrite this shared roadmap with the imported file.'
              : 'Destructive: overwrite this local draft with the imported file.'}
          </span>
          <span className="io-action-note">
            Requires confirmation. Keeps the current roadmap ID, session, and switcher entry.
          </span>
        </span>
        <span className="io-action-go" aria-hidden>
          <Icon name="arrow-right" size={15} />
        </span>
      </button>
    </div>
  )
}
