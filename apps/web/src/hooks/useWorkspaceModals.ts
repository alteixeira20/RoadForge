import { useState } from 'react'

export interface WorkspaceModals {
  showSave: boolean
  showShare: boolean
  showIO: boolean
  showTagRegistry: boolean
  openSave: () => void
  openShare: () => void
  openIO: () => void
  openTagRegistry: () => void
  closeSave: () => void
  closeShare: () => void
  closeIO: () => void
  closeTagRegistry: () => void
}

export function useWorkspaceModals(): WorkspaceModals {
  const [showSave, setShowSave] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showIO, setShowIO] = useState(false)
  const [showTagRegistry, setShowTagRegistry] = useState(false)

  return {
    showSave,
    showShare,
    showIO,
    showTagRegistry,
    openSave: () => setShowSave(true),
    openShare: () => setShowShare(true),
    openIO: () => setShowIO(true),
    openTagRegistry: () => setShowTagRegistry(true),
    closeSave: () => setShowSave(false),
    closeShare: () => setShowShare(false),
    closeIO: () => setShowIO(false),
    closeTagRegistry: () => setShowTagRegistry(false),
  }
}
