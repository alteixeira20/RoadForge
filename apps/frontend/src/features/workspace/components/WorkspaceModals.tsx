'use client'

import { SaveToServerModal } from '@/features/sharing/components/SaveToServerModal'
import { ShareModal } from '@/features/sharing/components/ShareModal'
import { IOModal } from '@/features/data-transfer/components/IOModal'
import type { ImportMode } from '@/features/data-transfer/lib/import-merge/types'
import type { Phase } from '@/shared/types/roadmap'

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
      <ShareModal open={showShare} onClose={onCloseShare} onToast={onToast} />
      <IOModal open={showIO} onClose={onCloseIO} onToast={onToast} onRoadmapImported={onRoadmapImported} />
    </>
  )
}
