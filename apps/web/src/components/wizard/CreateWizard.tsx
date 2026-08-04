'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import { canRestoreFocus, trapDialogTabFocus } from '@/lib/dialog-focus'
import { useRoadmap } from '@/context/RoadmapContext'
import { createBlankPhases } from '@/lib/roadmap-factory'
import { createRoadForgeTemplate } from '@/data/roadforge-template'

interface CreateWizardProps {
  onComplete: (roadmapId?: string) => void
  onClose: () => void
}

export function CreateWizard({ onComplete, onClose }: CreateWizardProps) {
  const { displayName, setDisplayName, createLocalRoadmap } = useRoadmap()
  const [step, setStep] = useState(0)
  const [startingPoint, setStartingPoint] = useState<'template' | 'blank'>('blank')
  const [draftDisplayName, setDraftDisplayName] = useState(() => displayName)
  // A new roadmap should never inherit the hidden starter snapshot's title or
  // the title of the roadmap that happened to be open before this dialog.
  const [draftRoadmapName, setDraftRoadmapName] = useState('')
  const headingId = useId()
  const displayNameId = useId()
  const roadmapNameId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const displayNameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 0) {
      const focusTimer = window.setTimeout(() => displayNameInputRef.current?.focus(), 100)
      return () => window.clearTimeout(focusTimer)
    }
    dialogRef.current?.focus()
  }, [step])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return
        onClose()
        return
      }
      if (event.key === 'Tab') trapDialogTabFocus(event, dialog)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)

      if (canRestoreFocus(previouslyFocused)) {
        const currentActive = document.activeElement
        const focusInside = currentActive instanceof Node && dialog.contains(currentActive)
        const focusOnBody = currentActive === document.body
        if (focusInside || focusOnBody || !currentActive) {
          previouslyFocused.focus({ preventScroll: true })
        }
      }
    }
  }, [onClose])

  const canContinue = draftDisplayName.trim().length > 0 && draftRoadmapName.trim().length > 0

  const handleFinish = () => {
    const template = startingPoint === 'template'
      ? createRoadForgeTemplate()
      : null
    const nextPhases = template?.phases ?? createBlankPhases()
    const nextDisplayName = draftDisplayName.trim()
    setDisplayName(nextDisplayName)
    const newRoadmapId = createLocalRoadmap(
      draftRoadmapName.trim(),
      nextPhases,
      template?.tagRegistry,
    )
    onComplete(newRoadmapId)
  }

  const continueFromBasics = () => {
    if (canContinue) setStep(1)
  }

  return (
    <div className="wizard-scrim">
      <div
        ref={dialogRef}
        className="wizard"
        role="dialog"
        aria-modal
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <div className="wizard-progress" aria-label={`Step ${step + 1} of 2`}>
          {[0, 1].map((index) => (
            <div
              key={index}
              className={`seg ${index < step ? 'done' : ''} ${index === step ? 'active' : ''}`}
            />
          ))}
        </div>

        <div className="wizard-step" key={step}>
          {step === 0 && (
            <>
              <span className="wizard-eyebrow">Step 1 of 2 · Basics</span>
              <h2 id={headingId}>Create your roadmap</h2>
              <p className="sub">
                No account is required. These details stay in this browser unless you choose to share.
              </p>

              <div className="field">
                <label htmlFor={displayNameId}>Your display name</label>
                <input
                  id={displayNameId}
                  ref={displayNameInputRef}
                  className="input"
                  autoComplete="nickname"
                  placeholder="e.g. Ada"
                  value={draftDisplayName}
                  onChange={(event) => setDraftDisplayName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') continueFromBasics()
                  }}
                />
                <span className="hint">Shown on assignments and collaboration activity.</span>
              </div>

              <div className="field">
                <label htmlFor={roadmapNameId}>Roadmap title</label>
                <input
                  id={roadmapNameId}
                  className="input"
                  autoComplete="off"
                  placeholder="e.g. Launch the first product version"
                  value={draftRoadmapName}
                  onChange={(event) => setDraftRoadmapName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') continueFromBasics()
                  }}
                />
                <span className="hint">Use the outcome you want to achieve.</span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <span className="wizard-eyebrow">Step 2 of 2 · Starting point</span>
              <h2 id={headingId}>Start simple</h2>
              <p className="sub">
                Choose an empty roadmap or a small example you can replace immediately.
              </p>

              <div className="starting-point-options">
                <button
                  type="button"
                  className={`option-card ${startingPoint === 'blank' ? 'active' : ''}`}
                  onClick={() => setStartingPoint('blank')}
                  aria-pressed={startingPoint === 'blank'}
                >
                  <div className="ic">
                    <Icon name="plus" size={20} />
                  </div>
                  <div className="meta">
                    <div className="h">Blank roadmap</div>
                    <div className="d">One empty phase. Best when you already know the first step.</div>
                  </div>
                  {startingPoint === 'blank' && (
                    <div className="check-mark"><Icon name="check" size={14} /></div>
                  )}
                </button>

                <button
                  type="button"
                  className={`option-card ${startingPoint === 'template' ? 'active' : ''}`}
                  onClick={() => setStartingPoint('template')}
                  aria-pressed={startingPoint === 'template'}
                >
                  <div className="ic">
                    <Icon name="spark" size={20} />
                  </div>
                  <div className="meta">
                    <div className="h">Starter example</div>
                    <div className="d">Three phases and nine tasks showing focus, dependencies, and progress.</div>
                  </div>
                  {startingPoint === 'template' && (
                    <div className="check-mark"><Icon name="check" size={14} /></div>
                  )}
                </button>
              </div>

              <div className="local-note">
                <div className="glyph">
                  <Icon name="device" size={20} stroke="#fff" />
                </div>
                <div className="body">
                  <div className="t">Local first</div>
                  <div className="d">
                    RoadForge saves in this browser and works offline. Server sync starts only when you choose Share.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="wizard-foot">
          {step === 1 ? (
            <button type="button" className="back" onClick={() => setStep(0)}>
              <span aria-hidden="true">← </span>Back
            </button>
          ) : (
            <button type="button" className="back" onClick={onClose}>
              Cancel
            </button>
          )}
          <span className="spacer" />
          {step === 0 ? (
            <button
              type="button"
              className="btn primary"
              onClick={continueFromBasics}
              disabled={!canContinue}
              style={{ opacity: canContinue ? 1 : 0.5 }}
            >
              Continue <Icon name="arrow-right" size={15} stroke="#fff" />
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={handleFinish}>
              Create roadmap <Icon name="arrow-right" size={15} stroke="#fff" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
