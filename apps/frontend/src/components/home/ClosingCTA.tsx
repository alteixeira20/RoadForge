'use client'

import { Icon } from '@/components/ui/Icon'

interface ClosingCTAProps {
  onCreate: () => void
}

export function ClosingCTA({ onCreate }: ClosingCTAProps) {
  return (
    <section className="closing-cta container" id="start">
      <h2>Ready to plan?</h2>
      <p>
        Create a roadmap now. Runs in your browser, saves to your device.
        No account, no setup.
      </p>
      <button className="btn primary lg" onClick={onCreate}>
        Create roadmap <Icon name="arrow-right" size={16} stroke="#fff" />
      </button>
    </section>
  )
}
