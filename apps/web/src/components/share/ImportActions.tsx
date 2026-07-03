import { Icon } from '@/components/ui/Icon'
import type { ImportMode } from '@/lib/import-merge/types'

interface ImportActionsProps {
  mode: ImportMode
  canReplaceCurrent: boolean
  serverRoadmapId: string | null
  onSelectImportFile: (mode: ImportMode) => void
}

const MODE_COPY: Record<ImportMode, { title: string; description: string }> = {
  'new-local': {
    title: 'Create a separate local copy',
    description: 'Import the file as a new local roadmap. Your current roadmap and collaborators are unchanged.',
  },
  'safe-additions': {
    title: 'Add only new content',
    description: 'Add new phases, tasks, and tags without overwriting existing roadmap content.',
  },
  'replace-current': {
    title: 'Replace this roadmap after review',
    description: 'Preview the imported file, then confirm exactly what will replace the current content.',
  },
}

export function ImportActions({
  mode,
  canReplaceCurrent,
  serverRoadmapId,
  onSelectImportFile,
}: ImportActionsProps) {
  const isReplace = mode === 'replace-current'
  const disabled = isReplace && !canReplaceCurrent
  const copy = MODE_COPY[mode]

  return (
    <section className={`io-mode-panel ${isReplace ? 'cautious' : ''}`}>
      <div className="io-mode-copy">
        <strong>{copy.title}</strong>
        <p>{copy.description}</p>
      </div>

      {isReplace && serverRoadmapId && canReplaceCurrent && (
        <div className="io-checkpoint-note">
          <Icon name="shield" size={14} />
          <span>
            RoadForge will save the current shared roadmap as a recovery version first.
            If that fails, replacement stops.
          </span>
        </div>
      )}
      {isReplace && !serverRoadmapId && (
        <div className="io-checkpoint-note">
          <Icon name="shield" size={14} />
          <span>
            Local replacement has no recovery version. Export the current roadmap first
            if you may need to restore it.
          </span>
        </div>
      )}
      {disabled && (
        <div className="io-checkpoint-note" role="status">
          <Icon name="shield" size={14} />
          <span>Viewers cannot replace a shared roadmap. Import as a new copy instead.</span>
        </div>
      )}

      <button
        type="button"
        className={`btn sm ${isReplace ? 'danger' : 'primary'} io-primary-action`}
        onClick={() => onSelectImportFile(mode)}
        disabled={disabled}
      >
        <Icon name={mode === 'new-local' ? 'plus' : 'import'} size={14} />
        Choose JSON file
      </button>
    </section>
  )
}
