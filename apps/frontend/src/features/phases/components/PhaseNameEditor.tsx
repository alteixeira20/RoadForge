'use client'

import { usePhaseNameEditor } from '@/features/phases/hooks/usePhaseNameEditor'
import { PhaseSummaryContent } from './PhaseSummaryContent'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Icon } from '@/shared/ui/Icon'
import type { Phase as PhaseType } from '@/shared/types/roadmap'

interface PhaseNameEditorProps {
  name: string
  num: string
  isActive: boolean
  isOpen: boolean
  displayStatus: PhaseType['status']
  progressPercent: number
  doneCount: number
  taskCount: number
  renameKey?: number
  onPhaseToggle: () => void
  onSave: (name: string) => void
  onEditingChange?: (editing: boolean) => void
}

export function PhaseNameEditor({
  name,
  num,
  isActive,
  isOpen,
  displayStatus,
  progressPercent,
  doneCount,
  taskCount,
  renameKey,
  onPhaseToggle,
  onSave,
  onEditingChange,
}: PhaseNameEditorProps) {
  const {
    editing,
    draft,
    setDraft,
    confirmDiscard,
    setConfirmDiscard,
    inputRef,
    focusInputAtStart,
    exitEditing,
    handleKeyDown,
    handleBlur,
  } = usePhaseNameEditor({ name, renameKey, onSave, onEditingChange })

  const summaryProps = {
    name, num, editing, draft, isActive, displayStatus,
    progressPercent, doneCount, taskCount,
    inputRef,
    onDraftChange: setDraft,
    onKeyDown: handleKeyDown,
    onBlur: handleBlur,
  }

  return (
    <>
      <button
        type="button"
        className="phase-toggle-btn"
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} phase ${name}`}
        onClick={onPhaseToggle}
      >
        <span className="chev">
          <Icon name="chevron-right" size={16} />
        </span>
      </button>
      <PhaseSummaryContent
        {...summaryProps}
        onToggle={editing ? undefined : onPhaseToggle}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        message="Your edits will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => { setConfirmDiscard(false); exitEditing() }}
        onClose={() => { setConfirmDiscard(false); focusInputAtStart() }}
      />
    </>
  )
}
