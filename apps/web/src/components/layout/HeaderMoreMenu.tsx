'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { RoadmapSwitcher } from '@/components/roadmap/RoadmapSwitcher'

interface HeaderMoreMenuProps {
  onIO?: () => void
}

export function HeaderMoreMenu({ onIO }: HeaderMoreMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen])

  return (
    <div className="header-more" ref={panelRef}>
      <button
        className="iconbtn"
        aria-label="More actions"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Icon name="more" size={16} />
      </button>

      {isOpen && (
        <div className="header-more-panel">
          {onIO && (
            <button
              className="header-more-row"
              onClick={() => { setIsOpen(false); onIO() }}
            >
              <Icon name="export" size={15} />
              Import / Export
            </button>
          )}
          {onIO && <div className="header-more-sep" />}
          <div className="header-more-block">
            <span className="header-more-label">Theme</span>
            <ThemeToggle />
          </div>
          <div className="header-more-sep" />
          <div className="header-more-block">
            <span className="header-more-label">Roadmaps</span>
            <RoadmapSwitcher variant="workspace" />
          </div>
        </div>
      )}
    </div>
  )
}
