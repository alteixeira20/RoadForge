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
  readOnly: boolean
  isLockedByOther: boolean
  renameKey?: number
  onPhaseToggle: () => void
  onBeforeEdit: () => Promise<boolean>
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
  readOnly,
  isLockedByOther,
  renameKey,
  onPhaseToggle,
  onBeforeEdit,
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
    exitEditing,
    handleDoubleClick,
    handleKeyDown,
  } = usePhaseNameEditor({ name, readOnly, isLockedByOther, renameKey, onBeforeEdit, onSave, onEditingChange })

  const summaryProps = {
    name, num, editing, draft, isActive, displayStatus,
    progressPercent, doneCount, taskCount, readOnly,
    inputRef,
    onDraftChange: setDraft,
    onKeyDown: handleKeyDown,
    onDoubleClick: handleDoubleClick,
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
        onClose={() => { setConfirmDiscard(false); inputRef.current?.focus() }}
      />
    </>
  )
}
