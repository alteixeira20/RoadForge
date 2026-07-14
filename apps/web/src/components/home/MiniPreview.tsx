'use client'

import type { ForgeStyle } from '@/types/ui'

export function MiniPreview() {
  return (
    <div className="preview-mini" aria-label="RoadForge workspace preview">
      <div className="preview-workspace-head">
        <span className="preview-roadmap-label">ROADMAP</span>
        <div className="title-line">API Integration Sprint</div>
        <div className="meta-line">
          <span>6 of 18 complete</span>
          <span>4 phases</span>
          <span className="preview-ready">1 ready next</span>
        </div>
      </div>
      <div className="preview-tabs" role="presentation">
        <span className="is-active">Roadmap</span>
        <span>Activity</span>
      </div>
      <div className="preview-controls" role="presentation">
        <span className="preview-search">Search tasks</span>
        <span className="preview-filter">All tasks ▾</span>
      </div>
      <div className="phase-mini" style={{ '--phase-color': '#d97442' } as ForgeStyle}>
        <div className="ph">
          <span className="num">01</span>
          <span className="nm">Foundation</span>
          <span className="ct">4 / 4</span>
        </div>
        <div className="task-mini done">
          <span className="ck" />
          <span className="tt">Auth service wired and tested</span>
        </div>
        <div className="task-mini done">
          <span className="ck" />
          <span className="tt">Database schema migrated</span>
          <span className="task-status complete">DONE</span>
        </div>
        <div className="task-mini done">
          <span className="ck" />
          <span className="tt">GET /items list endpoint</span>
        </div>
        <div className="task-mini">
          <span className="ck" />
          <span className="tt">POST /items create endpoint</span>
          <span className="task-status recommended">NEXT</span>
        </div>
        <div className="preview-progress"><span /></div>
      </div>
      <div className="phase-mini is-collapsed" style={{ '--phase-color': '#c97553' } as ForgeStyle}>
        <div className="ph">
          <span className="num">02</span>
          <span className="nm">Core Endpoints</span>
          <span className="ct">2 / 6</span>
        </div>
      </div>
      <div className="phase-mini is-collapsed" style={{ '--phase-color': '#8a877f' } as ForgeStyle}>
        <div className="ph">
          <span className="num">03</span>
          <span className="nm">Tests &amp; Docs</span>
          <span className="ct">0 / 5</span>
        </div>
      </div>
    </div>
  )
}
