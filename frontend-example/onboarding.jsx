// Roadforge — onboarding modal (4 steps + save flow)
const { useState, useEffect, useRef } = React;

function OnboardingModal({ step, setStep, onComplete, onClose, displayName, setDisplayName, roadmapName, setRoadmapName }) {
  const inputRef = useRef(null);
  useEffect(() => { if (step === 1 && inputRef.current) inputRef.current.focus(); }, [step]);
  useEffect(() => { if (step === 2 && inputRef.current) inputRef.current.focus(); }, [step]);

  const StepDots = ({ idx }) => (
    <div className="modal-eyebrow">
      <span>NEW ROADMAP</span>
      <span style={{ color: "var(--ink-4)" }}>·</span>
      <span className={`step ${idx === 0 ? "active" : idx > 0 ? "done" : ""}`}><span className="dot"/> Identity</span>
      <span className={`step ${idx === 1 ? "active" : idx > 1 ? "done" : ""}`}><span className="dot"/> Roadmap</span>
      <span className={`step ${idx === 2 ? "active" : idx > 2 ? "done" : ""}`}><span className="dot"/> Local-first</span>
      <span className={`step ${idx === 3 ? "active" : ""}`}><span className="dot"/> Save</span>
    </div>
  );

  return (
    <div className="modal-scrim" onClick={(e) => { if (e.target === e.currentTarget && step !== 0) onClose && onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        {step === 0 && (
          <>
            <div className="modal-body">
              <StepDots idx={0}/>
              <div>
                <h2>Who's forging this roadmap?</h2>
                <p className="lede">Pick a display name for this device. We don't ask for an account — Roadforge runs locally first, and only syncs if you choose to.</p>
              </div>
              <div className="field-group">
                <label>Display name</label>
                <input
                  ref={inputRef}
                  className="input"
                  placeholder="e.g. Ada Lovelace"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && displayName.trim()) setStep(1); }}
                />
                <span className="hint">Stored on this device. Change anytime in settings.</span>
              </div>
            </div>
            <div className="modal-foot">
              <span style={{ fontSize: 12, color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="lock" size={12}/> No account · No email · No tracking
              </span>
              <span className="spacer"/>
              <button className="btn primary" disabled={!displayName.trim()} onClick={() => setStep(1)} style={{ opacity: displayName.trim() ? 1 : 0.5 }}>
                Continue <Icon name="arrow-right" size={13}/>
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="modal-body">
              <StepDots idx={1}/>
              <div>
                <h2>Name your roadmap.</h2>
                <p className="lede">A short, scannable title. You can rename it later — and it shows up in the workspace header and any share links.</p>
              </div>
              <div className="field-group">
                <label>Roadmap title</label>
                <input
                  ref={inputRef}
                  className="input"
                  placeholder="e.g. v1.0 Public Launch"
                  value={roadmapName}
                  onChange={(e) => setRoadmapName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && roadmapName.trim()) setStep(2); }}
                />
                <span className="hint">Tip: phrase it as the outcome, not the work — “v1.0 Public Launch”, not “Build features”.</span>
              </div>
            </div>
            <div className="modal-foot">
              <button className="back" onClick={() => setStep(0)}>Back</button>
              <span className="spacer"/>
              <button className="btn primary" disabled={!roadmapName.trim()} onClick={() => setStep(2)} style={{ opacity: roadmapName.trim() ? 1 : 0.5 }}>
                Continue <Icon name="arrow-right" size={13}/>
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="modal-body">
              <StepDots idx={2}/>
              <div>
                <h2>This roadmap is stored locally on this device only.</h2>
                <p className="lede">Nothing leaves your machine until you say so. Edits are saved to your browser's local storage — fast, offline, private.</p>
              </div>
              <div className="callout">
                <div className="glyph">
                  <Icon name="device" size={18} stroke="#fff"/>
                </div>
                <div className="body">
                  <div className="t">Local-first by default</div>
                  <div className="d">
                    Works offline. Survives browser restarts. Exports to a portable JSON file at any time — the same schema AI agents read.
                  </div>
                  <div className="key">
                    <span className="pill">⌘E export</span>
                    <span className="pill">⌘I import</span>
                    <span className="pill">⌘S save to server</span>
                  </div>
                </div>
              </div>
              <div className="callout" style={{ borderColor: "rgba(217,116,66,0.30)" }}>
                <div className="glyph">
                  <Icon name="users" size={18} stroke="#fff"/>
                </div>
                <div className="body">
                  <div className="t">Collaboration is optional</div>
                  <div className="d">
                    Save to a self-hosted Roadforge server later to unlock real-time presence, activity logs, multi-device access, and signed share links. Never forced.
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="back" onClick={() => setStep(1)}>Back</button>
              <span className="spacer"/>
              <button className="btn" onClick={() => setStep(3)}>Save to server…</button>
              <button className="btn primary" onClick={onComplete}>
                Start forging <Icon name="arrow-right" size={13}/>
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="modal-body">
              <StepDots idx={3}/>
              <div>
                <h2>Continue locally, or unlock collaboration.</h2>
                <p className="lede">You can always switch later — Roadforge keeps the local copy as a fallback even after you save to a server.</p>
              </div>
              <div className="save-grid">
                <button className="save-card" onClick={onComplete}>
                  <div className="ic"><Icon name="device" size={18}/></div>
                  <div>
                    <div className="h">Stay local</div>
                    <div className="d">Edits stay on this device. Export to JSON anytime. No server required.</div>
                  </div>
                  <div className="arrow"><Icon name="chevron-right" size={16}/></div>
                </button>
                <button className="save-card recommended" onClick={onComplete}>
                  <div className="ic"><Icon name="cloud" size={18} stroke="#fff"/></div>
                  <div>
                    <div className="h">Save to server <span className="badge">Collab</span></div>
                    <div className="d">Real-time presence, activity log, multi-device, signed share links. Self-hosted or yours at <span className="mono" style={{ color: "var(--ink-2)" }}>roadforge.local:7878</span>.</div>
                  </div>
                  <div className="arrow"><Icon name="chevron-right" size={16}/></div>
                </button>
                <button className="save-card" onClick={onComplete}>
                  <div className="ic"><Icon name="link" size={18}/></div>
                  <div>
                    <div className="h">Connect a custom server</div>
                    <div className="d">Point Roadforge at any compatible endpoint. Bring your own auth.</div>
                  </div>
                  <div className="arrow"><Icon name="chevron-right" size={16}/></div>
                </button>
              </div>
            </div>
            <div className="modal-foot">
              <button className="back" onClick={() => setStep(2)}>Back</button>
              <span className="spacer"/>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>You can change this later in Roadmap settings.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

window.OnboardingModal = OnboardingModal;
