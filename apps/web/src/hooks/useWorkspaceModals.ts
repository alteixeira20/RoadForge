import { useState } from 'react'

export interface WorkspaceModals {
  showSave: boolean
  showShare: boolean
  showIO: boolean
  openSave: () => void
  openShare: () => void
  openIO: () => void
  closeSave: () => void
  closeShare: () => void
  closeIO: () => void
}

export function useWorkspaceModals(): WorkspaceModals {
  const [showSave, setShowSave] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showIO, setShowIO] = useState(false)

  return {
    showSave,
    showShare,
    showIO,
    openSave: () => setShowSave(true),
    openShare: () => setShowShare(true),
    openIO: () => setShowIO(true),
    closeSave: () => setShowSave(false),
    closeShare: () => setShowShare(false),
    closeIO: () => setShowIO(false),
  }
}
