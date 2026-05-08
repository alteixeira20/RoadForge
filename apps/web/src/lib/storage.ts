import type { Phase } from '@/types/roadmap'
import type { Theme } from '@/types/roadmap'

const KEYS = {
  theme: 'rf:theme',
  displayName: 'rf:displayName',
  roadmapName: 'rf:roadmapName',
  phases: 'rf:phases',
  saved: 'rf:saved',
} as const

function get(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function set(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // storage full or blocked — silently ignore
  }
}

function remove(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export const storage = {
  getTheme(): Theme | null {
    const v = get(KEYS.theme)
    return v === 'dark' || v === 'light' ? v : null
  },
  setTheme(theme: Theme): void {
    set(KEYS.theme, theme)
  },

  getDisplayName(): string | null {
    return get(KEYS.displayName)
  },
  setDisplayName(name: string): void {
    set(KEYS.displayName, name)
  },

  getRoadmapName(): string | null {
    return get(KEYS.roadmapName)
  },
  setRoadmapName(name: string): void {
    set(KEYS.roadmapName, name)
  },

  getPhases(): Phase[] | null {
    const raw = get(KEYS.phases)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Phase[]
      return null
    } catch {
      return null
    }
  },
  setPhases(phases: Phase[]): void {
    set(KEYS.phases, JSON.stringify(phases))
  },

  getSaved(): boolean {
    return get(KEYS.saved) === 'true'
  },
  setSaved(saved: boolean): void {
    set(KEYS.saved, String(saved))
  },

  clearAll(): void {
    Object.values(KEYS).forEach(remove)
  },
}
