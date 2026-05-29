'use client'

import { usePhaseNameEditor } from '@/hooks/usePhaseNameEditor'
import { PhaseSummaryContent } from './PhaseSummaryContent'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Phase as PhaseType } from '@/types/roadmap'

interface PhaseNameEditorProps {
  name: string
  num: string
  isActive: boolean
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
      {editing ? (
        <div className="phase-toggle-btn" role="presentation">
          <PhaseSummaryContent {...summaryProps} />
        </div>
      ) : (
        <button type="button" className="phase-toggle-btn" onClick={onPhaseToggle}>
          <PhaseSummaryContent {...summaryProps} />
        </button>
      )}
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
