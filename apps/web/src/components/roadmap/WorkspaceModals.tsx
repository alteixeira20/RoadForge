'use client'

import { SaveToServerModal } from '@/components/share/SaveToServerModal'
import { ShareModal } from '@/components/share/ShareModal'
import { IOModal } from '@/components/share/IOModal'

interface WorkspaceModalsProps {
  showSave: boolean
  showShare: boolean
  showIO: boolean
  onCloseSave: () => void
  onCloseShare: () => void
  onCloseIO: () => void
  onConfirmSave: () => void
  onToast: (msg: string) => void
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
}: WorkspaceModalsProps) {
  return (
    <>
      <SaveToServerModal
        open={showSave}
        onClose={onCloseSave}
        onConfirm={onConfirmSave}
      />
      <ShareModal open={showShare} onClose={onCloseShare} onToast={onToast} />
      <IOModal open={showIO} onClose={onCloseIO} onToast={onToast} />
    </>
  )
}
