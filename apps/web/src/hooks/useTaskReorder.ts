'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

export interface DragState {
  isDragging: boolean
  draggedId: string | null
  draggedIndex: number | null
  visualDropSlot: number | null
  translateY: number
}

interface UseTaskReorderProps {
  taskIds: string[]
  onReorder: (newOrder: string[]) => void
  readOnly?: boolean
}

export function useTaskReorder({ taskIds, onReorder, readOnly = false }: UseTaskReorderProps) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedId: null,
    draggedIndex: null,
    visualDropSlot: null,
    translateY: 0,
  })

  // Store pointer start position and initial bounds to avoid repeated DOM reads
  const dragData = useRef({
    startY: 0,
    bounds: [] as { id: string; top: number; bottom: number; height: number }[],
  })

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, taskId: string, index: number) => {
      if (readOnly) return
      
      const target = e.target as HTMLElement
      if (!target.closest('.drag-handle')) return

      e.currentTarget.setPointerCapture(e.pointerId)
      
      // Measure all sibling task wrappers in this phase
      const phaseBody = e.currentTarget.closest('.phase-body')
      if (phaseBody) {
        const wrappers = Array.from(phaseBody.querySelectorAll('.draggable-task-wrapper'))
        dragData.current.bounds = wrappers.map((w, i) => {
          const rect = w.getBoundingClientRect()
          return { id: taskIds[i], top: rect.top, bottom: rect.bottom, height: rect.height }
        })
      }

      dragData.current.startY = e.clientY

      setDragState({
        isDragging: true,
        draggedId: taskId,
        draggedIndex: index,
        visualDropSlot: index,
        translateY: 0,
      })
    },
    [readOnly, taskIds]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.isDragging || dragState.draggedIndex === null) return

      const clientY = e.clientY
      const deltaY = clientY - dragData.current.startY
      const { bounds } = dragData.current

      // Calculate insertion index
      // We are looking for where the pointer is relative to the row midpoints
      let visualDropSlot = bounds.length

      for (let i = 0; i < bounds.length; i++) {
        const bound = bounds[i]
        const midpoint = bound.top + bound.height / 2
        
        if (clientY < midpoint) {
          visualDropSlot = i
          break
        }
      }

      setDragState(prev => ({
        ...prev,
        translateY: deltaY,
        visualDropSlot
      }))
    },
    [dragState.isDragging, dragState.draggedIndex]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.isDragging || dragState.draggedId === null || dragState.visualDropSlot === null || dragState.draggedIndex === null) return

      e.currentTarget.releasePointerCapture(e.pointerId)

      let finalDropIndex = dragState.visualDropSlot
      if (dragState.visualDropSlot > dragState.draggedIndex) {
        finalDropIndex = dragState.visualDropSlot - 1
      }

      if (dragState.draggedIndex !== finalDropIndex) {
        const newOrder = [...taskIds]
        newOrder.splice(dragState.draggedIndex, 1)
        newOrder.splice(finalDropIndex, 0, dragState.draggedId)
        onReorder(newOrder)
      }

      setDragState({
        isDragging: false,
        draggedId: null,
        draggedIndex: null,
        visualDropSlot: null,
        translateY: 0,
      })
    },
    [dragState, taskIds, onReorder]
  )
  
  // Safety reset
  useEffect(() => {
     const handleEsc = (e: KeyboardEvent) => {
       if (e.key === 'Escape' && dragState.isDragging) {
         setDragState({
            isDragging: false,
            draggedId: null,
            draggedIndex: null,
            visualDropSlot: null,
            translateY: 0,
         })
       }
     }
     window.addEventListener('keydown', handleEsc)
     return () => window.removeEventListener('keydown', handleEsc)
  }, [dragState.isDragging])

  return {
    dragState,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  }
}
