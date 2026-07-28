'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { storage } from '@/lib/storage'

interface TaskTagDisplayPreferences {
  favoriteTagId: string | null
  showAutomaticStatus: boolean
}

interface TaskTagPreferenceEventDetail {
  storageKey: string
  preferences: TaskTagDisplayPreferences
}

const STORAGE_PREFIX = 'roadforge.task-tag-display.v1'
const PREFERENCE_EVENT = 'roadforge:task-tag-display-change'
const DEFAULT_PREFERENCES: TaskTagDisplayPreferences = {
  favoriteTagId: null,
  showAutomaticStatus: true,
}

export function isAutomaticTaskTag(tagId: string): boolean {
  return /^status:/i.test(tagId.trim())
}

export function getUserDisplayTags(tagIds: string[]): string[] {
  return tagIds.filter((tagId) => !isAutomaticTaskTag(tagId))
}

function readPreferences(storageKey: string): TaskTagDisplayPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES

  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return DEFAULT_PREFERENCES

    const parsed = JSON.parse(stored) as Partial<TaskTagDisplayPreferences>
    return {
      favoriteTagId: typeof parsed.favoriteTagId === 'string'
        ? parsed.favoriteTagId
        : null,
      showAutomaticStatus: parsed.showAutomaticStatus !== false,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function writePreferences(
  storageKey: string,
  preferences: TaskTagDisplayPreferences,
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(preferences))
  } catch {
    // The preference remains active for this session when browser storage is blocked.
  }
}

export function useTaskTagDisplayPreferences(taskId: string, tagIds: string[]) {
  const activeRoadmapId = storage.getActiveRoadmapId()
  const userTags = useMemo(() => getUserDisplayTags(tagIds), [tagIds])
  const storageKey = `${STORAGE_PREFIX}:${activeRoadmapId ?? 'local'}:${taskId}`
  const [preferences, setPreferences] = useState<TaskTagDisplayPreferences>(
    DEFAULT_PREFERENCES,
  )

  useEffect(() => {
    setPreferences(readPreferences(storageKey))

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setPreferences(readPreferences(storageKey))
      }
    }
    const handlePreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<TaskTagPreferenceEventDetail>).detail
      if (detail?.storageKey === storageKey) {
        setPreferences(detail.preferences)
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(PREFERENCE_EVENT, handlePreferenceChange)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(PREFERENCE_EVENT, handlePreferenceChange)
    }
  }, [storageKey])

  const updatePreferences = useCallback((
    updater: (current: TaskTagDisplayPreferences) => TaskTagDisplayPreferences,
  ) => {
    setPreferences((current) => {
      const next = updater(current)
      writePreferences(storageKey, next)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<TaskTagPreferenceEventDetail>(PREFERENCE_EVENT, {
          detail: { storageKey, preferences: next },
        }))
      }
      return next
    })
  }, [storageKey])

  const selectFavoriteTag = useCallback((tagId: string) => {
    if (!userTags.includes(tagId)) return
    updatePreferences((current) => ({ ...current, favoriteTagId: tagId }))
  }, [updatePreferences, userTags])

  const toggleAutomaticStatus = useCallback(() => {
    updatePreferences((current) => ({
      ...current,
      showAutomaticStatus: !current.showAutomaticStatus,
    }))
  }, [updatePreferences])

  const favoriteTagId = preferences.favoriteTagId
    && userTags.includes(preferences.favoriteTagId)
    ? preferences.favoriteTagId
    : userTags[0] ?? null

  return {
    userTags,
    favoriteTagId,
    showAutomaticStatus: preferences.showAutomaticStatus,
    selectFavoriteTag,
    toggleAutomaticStatus,
  }
}
