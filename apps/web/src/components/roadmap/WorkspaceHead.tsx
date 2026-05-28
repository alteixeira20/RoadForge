'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'

interface WorkspaceHeadProps {
  roadmapName: string
  totalDone: number
  totalTasks: number
  phaseCount: number
  saved: boolean
  nextReadyCount: number
  canRename?: boolean
  maxNameLength?: number
  onRename?: (name: string) => boolean
}

export function WorkspaceHead({
  roadmapName,
  totalDone,
  totalTasks,
  phaseCount,
  saved,
  nextReadyCount,
  canRename = false,
  maxNameLength,
  onRename,
}: WorkspaceHeadProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(roadmapName)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const skipBlurSaveRef = useRef(false)

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
    setDraftName(roadmapName)
    setIsEditing(true)
  }

  const saveEdit = () => {
    const didSave = onRename?.(draftName) ?? true
    if (!didSave) setDraftName(roadmapName)
    setIsEditing(false)
  }

  const cancelEdit = () => {
    skipBlurSaveRef.current = true
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
            <span>{roadmapName}</span>
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
        {nextReadyCount > 0 && (
          <span className="ember">
            <Icon name="flame" size={14} stroke="var(--ember)" /> {nextReadyCount}{' '}
            {nextReadyCount === 1 ? 'task' : 'tasks'} ready next
          </span>
        )}
        {saved && (
          <span>
            <Icon name="users" size={14} /> Collaboration enabled
          </span>
        )}
      </div>
    </div>
  )
}
