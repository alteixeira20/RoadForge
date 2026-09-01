'use client'

import { TEAM_FEATURES_ENABLED } from '@/config/capabilities'
import { SaveToServerModal } from '@/components/share/SaveToServerModal'
import { ShareModal } from '@/components/share/ShareModal'
import { IOModal } from '@/components/share/IOModal'
import type { ImportMode } from '@/lib/import-merge/types'
import type { Phase } from '@/types/roadmap'

interface WorkspaceModalsProps {
  showSave: boolean
  showShare: boolean
  showIO: boolean
  onCloseSave: () => void
  onCloseShare: () => void
  onCloseIO: () => void
  onConfirmSave: (password?: string) => void
  onToast: (msg: string) => void
  onRoadmapImported?: (
    roadmapName: string | undefined,
    phases: Phase[],
    mode: ImportMode,
  ) => void
}

export function WorkspaceModals({
  showSave,
  showShare,
  showIO,
  onCloseSave,
  onCloseShare,
  onCloseIO,
  onConfirmSave,
  onToast,
  onRoadmapImported,
}: WorkspaceModalsProps) {
  return (
    <>
      <SaveToServerModal
        open={showSave}
        onClose={onCloseSave}
        onConfirm={onConfirmSave}
      />
      {TEAM_FEATURES_ENABLED && (
        <ShareModal open={showShare} onClose={onCloseShare} onToast={onToast} />
      )}
      <IOModal open={showIO} onClose={onCloseIO} onToast={onToast} onRoadmapImported={onRoadmapImported} />
    </>
  )
}
