'use client'

import type { ForgeStyle } from '@/types/ui'

export function MiniPreview() {
  return (
    <div className="preview-mini">
      <div className="title-line">API Integration Sprint</div>
      <div className="meta-line">
        <span>4 phases</span>
        <span>·</span>
        <span>6 of 18 done</span>
        <span>·</span>
        <span style={{ color: 'var(--ember)' }}>1 task ready next</span>
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
        </div>
      </div>
      <div className="phase-mini" style={{ '--phase-color': '#c97553' } as ForgeStyle}>
        <div className="ph">
          <span className="num">02</span>
          <span className="nm">Core Endpoints</span>
          <span className="ct">2 / 6</span>
        </div>
        <div className="task-mini done">
          <span className="ck" />
          <span className="tt">GET /items list endpoint</span>
        </div>
        <div className="task-mini">
          <span className="ck" />
          <span className="tt">POST /items create endpoint</span>
          <span className="pp">RECOMMENDED</span>
        </div>
        <div className="task-mini">
          <span className="ck" />
          <span className="tt">Error handling middleware</span>
        </div>
      </div>
      <div className="phase-mini" style={{ '--phase-color': '#c97553', opacity: 0.65 } as ForgeStyle}>
        <div className="ph">
          <span className="num">03</span>
          <span className="nm">Tests &amp; Docs</span>
          <span className="ct">0 / 5</span>
        </div>
      </div>
    </div>
  )
}
