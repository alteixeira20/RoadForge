'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import { canRestoreFocus, trapDialogTabFocus } from '@/lib/dialog-focus'
import { useRoadmap } from '@/context/RoadmapContext'
import { createBlankPhases } from '@/lib/roadmap-factory'
import { SAMPLE_ROADMAP } from '@/data/sample-roadmap'

interface CreateWizardProps {
  onComplete: (roadmapId?: string) => void
  onClose: () => void
}

export function CreateWizard({ onComplete, onClose }: CreateWizardProps) {
  const { displayName, setDisplayName, roadmapName, createLocalRoadmap } = useRoadmap()
  const [step, setStep] = useState(0)
  const [startingPoint, setStartingPoint] = useState<'template' | 'blank'>('blank')
  const [draftDisplayName, setDraftDisplayName] = useState(() => displayName)
  const [draftRoadmapName, setDraftRoadmapName] = useState(() => roadmapName)
  const headingId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 0 || step === 1) {
      const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 100)
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
          previouslyFocused.focus()
        }
      }
    }
  }, [onClose])

  const next = () => setStep((s) => s + 1)
  const back = () => setStep((s) => Math.max(0, s - 1))

  const handleFinish = () => {
    const nextPhases = startingPoint === 'blank' ? createBlankPhases() : SAMPLE_ROADMAP.phases
    const nextDisplayName = draftDisplayName.trim()
    setDisplayName(nextDisplayName)
    const newRoadmapId = createLocalRoadmap(draftRoadmapName.trim() || 'Untitled Roadmap', nextPhases)
    onComplete(newRoadmapId)
  }

  const canProceed =
    (step === 0 && draftDisplayName.trim().length > 0) ||
    (step === 1 && draftRoadmapName.trim().length > 0) ||
    step === 2 ||
    step === 3 ||
    step === 4

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
        <div className="wizard-progress">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`seg ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`}
            />
          ))}
        </div>

        <div className="wizard-step" key={step}>
          {step === 0 && (
            <>
              <span className="wizard-eyebrow">Step 1 of 5 · Your name</span>
              <h2 id={headingId}>What should we call you?</h2>
              <p className="sub">
                Pick a display name for this device. There&apos;s no account, no
                email — just a name we can show on tasks you own.
              </p>
              <div className="field">
                <label htmlFor="dn">Display name</label>
                <input
                  id="dn"
                  ref={inputRef}
                  className="input"
                  placeholder="e.g. Ada Lovelace"
                  value={draftDisplayName}
                  onChange={(e) => setDraftDisplayName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canProceed) next()
                  }}
                />
                <span className="hint">
                  Stored on this device. You can change it anytime.
                </span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <span className="wizard-eyebrow">Step 2 of 5 · Roadmap title</span>
              <h2 id={headingId}>Name your roadmap.</h2>
              <p className="sub">
                A short, scannable title — phrased as the outcome, not the work.
              </p>
              <div className="field">
                <label htmlFor="rn">Roadmap title</label>
                <input
                  id="rn"
                  ref={inputRef}
                  className="input"
                  placeholder="e.g. v1.0 Public Launch"
                  value={draftRoadmapName}
                  onChange={(e) => setDraftRoadmapName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canProceed) next()
                  }}
                />
                <span className="hint">
                  You can rename it later from the workspace header.
                </span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <span className="wizard-eyebrow">Step 3 of 5 · Starting point</span>
              <h2 id={headingId}>How do you want to start?</h2>
              <p className="sub">
                Choose between a blank slate or a template with examples.
              </p>
              
              <div className="starting-point-options">
                <button 
                  className={`option-card ${startingPoint === 'blank' ? 'active' : ''}`}
                  onClick={() => setStartingPoint('blank')}
                  aria-pressed={startingPoint === 'blank'}
                >
                  <div className="ic">
                    <Icon name="plus" size={20} />
                  </div>
                  <div className="meta">
                    <div className="h">Start blank</div>
                    <div className="d">Start with an empty phase and build your own roadmap.</div>
                  </div>
                  {startingPoint === 'blank' && <div className="check-mark"><Icon name="check" size={14} /></div>}
                </button>

                <button 
                  className={`option-card ${startingPoint === 'template' ? 'active' : ''}`}
                  onClick={() => setStartingPoint('template')}
                  aria-pressed={startingPoint === 'template'}
                >
                  <div className="ic">
                    <Icon name="spark" size={20} />
                  </div>
                  <div className="meta">
                    <div className="h">Use template</div>
                    <div className="d">Explore RoadForge with example phases, tasks, and dependencies.</div>
                  </div>
                  {startingPoint === 'template' && <div className="check-mark"><Icon name="check" size={14} /></div>}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <span className="wizard-eyebrow">Step 4 of 5 · How storage works</span>
              <h2 id={headingId}>This roadmap stays on your device.</h2>
              <p className="sub">
                Nothing leaves your machine until you choose to share it.
              </p>
              <div className="local-note">
                <div className="glyph">
                  <Icon name="device" size={20} stroke="#fff" />
                </div>
                <div className="body">
                  <div className="t">Local-first by default</div>
                  <div className="d">
                    Saves to your browser&apos;s local storage. Works offline. Survives
                    restarts.
                  </div>
                </div>
              </div>
              <div className="bullet-list">
                <div className="row">
                  <span className="dot">
                    <Icon name="check" size={12} />
                  </span>
                  <div className="text">
                    <b>Export anytime</b> to a portable JSON file — the same
                    format AI agents read.
                  </div>
                </div>
                <div className="row">
                  <span className="dot">
                    <Icon name="check" size={12} />
                  </span>
                  <div className="text">
                    <b>Save to a server later</b> to unlock real-time
                    collaboration and activity logs.
                  </div>
                </div>
                <div className="row">
                  <span className="dot">
                    <Icon name="check" size={12} />
                  </span>
                  <div className="text">
                    <b>Collaboration is optional.</b> If you stay local, you
                    stay local. No nags.
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <span className="wizard-eyebrow">Step 5 of 5 · Ready</span>
              <h2 id={headingId}>Ready to forge.</h2>
              <p className="sub">
                We&apos;ll open{' '}
                <b style={{ color: 'var(--ink)' }}>
                  {draftRoadmapName.trim() || 'your roadmap'}
                </b>{' '}
                {startingPoint === 'template' ? 'with a starter set of phases.' : 'as a blank slate.'} Edit anything, delete anything —
                it&apos;s yours.
              </p>
              <div className="local-note" style={{ borderColor: 'rgba(217,116,66,0.30)' }}>
                <div className="glyph">
                  <Icon name="flame" size={20} stroke="#fff" />
                </div>
                <div className="body">
                  <div className="t">
                    Welcome, {draftDisplayName.trim() || 'friend'}.
                  </div>
                  <div className="d">
                    Your roadmap is ready. Take a breath — you can move slowly.
                    RoadForge waits.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="wizard-foot">
          {step > 0 ? (
            <button className="back" onClick={back}>
              <span aria-hidden="true">← </span>Back
            </button>
          ) : (
            <button className="back" onClick={onClose}>
              Cancel
            </button>
          )}
          <span className="spacer" />
          {step < 4 ? (
            <button
              className="btn primary"
              onClick={next}
              disabled={!canProceed}
              style={{ opacity: canProceed ? 1 : 0.5 }}
            >
              Continue <Icon name="arrow-right" size={15} stroke="#fff" />
            </button>
          ) : (
            <button className="btn primary" onClick={handleFinish}>
              Open roadmap <Icon name="arrow-right" size={15} stroke="#fff" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
