import { Icon } from '@/components/ui/Icon'
import { LandingSectionFrame } from '@/components/home/LandingSectionFrame'
import { MiniPreview } from '@/components/home/MiniPreview'

export function WorkspaceProofSection() {
  return (
    <LandingSectionFrame
      id="proof"
      title="One file. Phases, tasks, and what to build next."
      lede="The plan is a single portable JSON file, readable by people and compatible tools. Dependencies surface the recommended next task automatically."
    >
      <div className="proof-wrap">
        <div className="proof-demo">
          <MiniPreview />
        </div>

        <div className="proof-callouts">
          <div className="proof-callout">
            <div className="ic"><Icon name="export" size={18} /></div>
            <div>
              <h3>Portable JSON format</h3>
              <p>
                Export your roadmap at any time. Import it anywhere. No lock-in,
                no vendor dependency - the file is yours.
              </p>
            </div>
          </div>
          <div className="proof-callout">
            <div className="ic"><Icon name="fold" size={18} /></div>
            <div>
              <h3>Dependencies show what&apos;s next</h3>
              <p>
                Mark what depends on what. RoadForge highlights the recommended
                next task based on what is already complete.
              </p>
            </div>
          </div>
          <div className="proof-callout">
            <div className="ic"><Icon name="robot" size={18} /></div>
            <div>
              <h3>Works with your toolchain</h3>
              <p>
                Keep roadmap data in a stable, inspectable format that can be
                reviewed, versioned, and processed by compatible tools.
              </p>
            </div>
          </div>
          <div className="proof-callout">
            <div className="ic"><Icon name="cloud" size={18} /></div>
            <div>
              <h3>Local first, sync when ready</h3>
              <p>
                Everything works offline. Save to a server only when you need
                participants, share links, or an activity log.
              </p>
            </div>
          </div>
        </div>
      </div>
    </LandingSectionFrame>
  )
}
