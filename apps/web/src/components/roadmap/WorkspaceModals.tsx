'use client'

import { SaveToServerModal } from '@/components/share/SaveToServerModal'
import { ShareModal } from '@/components/share/ShareModal'
import { IOModal } from '@/components/share/IOModal'
import { TagRegistryModal } from './TagRegistryModal'
import type { Phase } from '@/types/roadmap'

interface WorkspaceModalsProps {
  showSave: boolean
  showShare: boolean
  showIO: boolean
  showTagRegistry: boolean
  onCloseSave: () => void
  onCloseShare: () => void
  onCloseIO: () => void
  onCloseTagRegistry: () => void
  onConfirmSave: (password?: string) => void
  onToast: (msg: string) => void
  onRoadmapImported?: (roadmapName: string | undefined, phases: Phase[]) => void
  readOnly?: boolean
}

export function WorkspaceModals({
  showSave,
  showShare,
  showIO,
  showTagRegistry,
  onCloseSave,
  onCloseShare,
  onCloseIO,
  onCloseTagRegistry,
  onConfirmSave,
  onToast,
  onRoadmapImported,
  readOnly = false,
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
      <TagRegistryModal open={showTagRegistry} onClose={onCloseTagRegistry} readOnly={readOnly} />
    </>
  )
}
