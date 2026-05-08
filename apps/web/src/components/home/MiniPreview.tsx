'use client'

import type { ForgeStyle } from '@/types/ui'

export function MiniPreview() {
  return (
    <div className="preview-mini">
      <div className="title-line">v1.0 Public Launch</div>
      <div className="meta-line">
        <span>5 phases</span>
        <span>·</span>
        <span>4 of 19 done</span>
        <span>·</span>
        <span style={{ color: 'var(--ember)' }}>1 task ready next</span>
      </div>
      <div className="phase-mini" style={{ '--phase-color': '#d97442' } as ForgeStyle}>
        <div className="ph">
          <span className="num">02</span>
          <span className="nm">Core Workspace</span>
          <span className="ct">3 / 5</span>
        </div>
        <div className="task-mini done">
          <span className="ck" />
          <span className="tt">Vertical phases with collapsible tasks</span>
        </div>
        <div className="task-mini">
          <span className="ck" />
          <span className="tt">Inline task detail and dependencies</span>
          <span className="pp">NEXT</span>
        </div>
        <div className="task-mini">
          <span className="ck" />
          <span className="tt">Suggested next task</span>
        </div>
      </div>
      <div className="phase-mini" style={{ '--phase-color': '#c97553', opacity: 0.85 } as ForgeStyle}>
        <div className="ph">
          <span className="num">03</span>
          <span className="nm">Sync &amp; Collaboration</span>
          <span className="ct">0 / 4</span>
        </div>
      </div>
    </div>
  )
}
