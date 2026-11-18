'use client'

import { useCallback, useRef, useState } from 'react'

export interface FocusedWriteGate {
  focusedWriteInFlight: boolean
  beginFocusedWrite: () => void
  endFocusedWrite: () => void
}

/**
 * Reference-counted gate for focused writes that must not overlap aggregate autosave.
 *
 * A boolean is insufficient because independent focused operations can overlap. The
 * ref gives callbacks synchronous ownership while state exposes the aggregate gate to
 * React consumers such as useAutoSync/useSaveFlow.
 */
export function useFocusedWriteGate(): FocusedWriteGate {
  const countRef = useRef(0)
  const [count, setCount] = useState(0)

  const beginFocusedWrite = useCallback(() => {
    countRef.current += 1
    setCount(countRef.current)
  }, [])

  const endFocusedWrite = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1)
    setCount(countRef.current)
  }, [])

  return {
    focusedWriteInFlight: count > 0,
    beginFocusedWrite,
    endFocusedWrite,
  }
}
