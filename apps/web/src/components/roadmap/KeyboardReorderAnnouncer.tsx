'use client'

import type { CSSProperties } from 'react'

// Visually hidden live region for useKeyboardReorder's pickup/move/drop/
// cancel announcements. dnd-kit's own default announcer only fires for
// drags it drives itself, so it stays silent for the app-owned keyboard
// reorder path (see useKeyboardReorder.ts) — this replaces it for that path.
const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export function KeyboardReorderAnnouncer({ message }: { message: string }) {
  return (
    <div role="status" aria-live="assertive" aria-atomic="true" style={visuallyHiddenStyle}>
      {message}
    </div>
  )
}
