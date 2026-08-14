'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useRoadmapData, useRoadmapSession } from '@/context/RoadmapContext'
import { useRoadmapRename } from '@/hooks/useRoadmapRename'

interface WorkspaceHeadProps {
  roadmapName: string
  totalDone: number
  totalTasks: number
  phaseCount: number
  saved: boolean
  recommendedCount: number
  canRename?: boolean
  maxNameLength?: number
  onRename?: (name: string) => boolean
  isSample?: boolean
}

export function WorkspaceHead({
  roadmapName,
  totalDone,
  totalTasks,
  phaseCount,
  saved,
  recommendedCount,
  canRename = false,
  maxNameLength,
  onRename,
  isSample = false,
}: WorkspaceHeadProps) {
  const {
    setRoadmapName,
    setSaved,
    updatedAt,
    setUpdatedAt,
  } = useRoadmapData()
  const {
    serverRoadmapId,
    setServerRoadmapId,
    sessionToken,
    setSessionToken,
    setParticipantId,
    setRole,
  } = useRoadmapSession()
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(roadmapName)
  const [renameMessage, setRenameMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const skipBlurSaveRef = useRef(false)

  const handleRenameSessionExpired = useCallback(() => {
    // Clearing serverRoadmapId removes the persisted auth cache for the active
    // roadmap; clear the in-memory session slice at the same time.
    setServerRoadmapId(null)
    setSessionToken(null)
    setParticipantId(null)
    setRole(null)
    setSaved(false)
  }, [
    setParticipantId,
    setRole,
    setSaved,
    setServerRoadmapId,
    setSessionToken,
  ])

  const { handleRenameRoadmap } = useRoadmapRename({
    roadmapName,
    setRoadmapName,
    setSaved,
    canRename,
    serverRoadmapId,
    sessionToken,
    updatedAt,
    setUpdatedAt: (value) => setUpdatedAt(value),
    onLocalRename: onRename,
    showMessage: setRenameMessage,
    onSessionExpired: handleRenameSessionExpired,
  })

  useEffect(() => {
    if (!isEditing) setDraftName(roadmapName)
  }, [isEditing, roadmapName])

  useEffect(() => {
    if (!isEditing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isEditing])

  useEffect(() => {
    if (canRename || !isEditing) return
    setDraftName(roadmapName)
    setIsEditing(false)
  }, [canRename, isEditing, roadmapName])

  const startEditing = () => {
    if (!canRename) return
    skipBlurSaveRef.current = false
    setRenameMessage(null)
    setDraftName(roadmapName)
    setIsEditing(true)
  }

  const saveEdit = () => {
    const didSave = handleRenameRoadmap(draftName)
    if (!didSave) setDraftName(roadmapName)
    setIsEditing(false)
  }

  const cancelEdit = () => {
    skipBlurSaveRef.current = true
    setRenameMessage(null)
    setDraftName(roadmapName)
    setIsEditing(false)
  }

  return (
    <div className="workspace-head">
      <div className="crumbline">Roadmap</div>
      <div className={`roadmap-title-row ${canRename && !isEditing ? 'rename-available' : ''}`}>
        <h1
          className={canRename && !isEditing ? 'roadmap-title-renamable' : undefined}
          onDoubleClick={startEditing}
          tabIndex={canRename && !isEditing ? 0 : undefined}
          title={canRename && !isEditing ? 'Double-click to rename' : undefined}
          onKeyDown={(event) => {
            if (!canRename || isEditing) return
            if (event.key === 'Enter') {
              event.preventDefault()
              startEditing()
            }
          }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              className="roadmap-title-input"
              aria-label="Roadmap name"
              value={draftName}
              maxLength={maxNameLength}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => {
                if (skipBlurSaveRef.current) {
                  skipBlurSaveRef.current = false
                  return
                }
                saveEdit()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  saveEdit()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelEdit()
                }
              }}
            />
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
              <span>{roadmapName}</span>
              {isSample && (
                <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-2)', background: 'var(--bg-3)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center' }}>
                  Sample Roadmap
                </span>
              )}
            </span>
          )}
        </h1>
        {canRename && !isEditing && (
          <button
            type="button"
            className="roadmap-title-edit"
            aria-label="Rename roadmap"
            onClick={startEditing}
          >
            <Icon name="pencil" size={16} />
          </button>
        )}
      </div>
      <div className="meta">
        <span>
          <Icon name="circle-check" size={14} /> {totalDone} of {totalTasks} done
        </span>
        <span>{phaseCount} phases</span>
        {recommendedCount > 0 && (
          <span className="ember">
            <Icon name="flame" size={14} stroke="var(--ember)" /> {recommendedCount}{' '}
            {recommendedCount === 1 ? 'task' : 'tasks'} recommended
          </span>
        )}
        {saved && (
          <span>
            <Icon name="users" size={14} /> Collaboration enabled
          </span>
        )}
        {renameMessage && (
          <span role="status" aria-live="polite" className="ember">
            {renameMessage}
          </span>
        )}
      </div>
    </div>
  )
}
