// Roadforge — wizard (4 steps: identity, title, local-only, enter)
const { useState: useStateW, useEffect: useEffectW, useRef: useRefW } = React;

function Wizard({ onComplete, onClose, displayName, setDisplayName, roadmapName, setRoadmapName }) {
  const [step, setStep] = useStateW(0);
  const inputRef = useRefW(null);

  useEffectW(() => {
    if ((step === 0 || step === 1) && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step]);

  useEffectW(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => Math.max(0, s - 1));

  const canProceed =
    (step === 0 && displayName.trim().length > 0) ||
    (step === 1 && roadmapName.trim().length > 0) ||
    step === 2 ||
    step === 3;

  return (
    <div className="wizard-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className="wizard" role="dialog" aria-modal="true">
        <div className="wizard-progress">
          {[0,1,2,3].map(i => (
            <div key={i} className={`seg ${i < step ? "done" : ""} ${i === step ? "active" : ""}`}/>
          ))}
        </div>

        <div className="wizard-step" key={step}>
          {step === 0 && (
            <>
              <span className="wizard-eyebrow">Step 1 of 4 · Your name</span>
              <h2>What should we call you?</h2>
              <p className="sub">Pick a display name for this device. There's no account, no email — just a name we can show on tasks you own.</p>
              <div className="field">
                <label htmlFor="dn">Display name</label>
                <input
                  id="dn"
                  ref={inputRef}
                  className="input"
                  placeholder="e.g. Ada Lovelace"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canProceed) next(); }}
                />
                <span className="hint">Stored on this device. You can change it anytime.</span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <span className="wizard-eyebrow">Step 2 of 4 · Roadmap title</span>
              <h2>Name your roadmap.</h2>
              <p className="sub">A short, scannable title — phrased as the outcome, not the work.</p>
              <div className="field">
                <label htmlFor="rn">Roadmap title</label>
                <input
                  id="rn"
                  ref={inputRef}
                  className="input"
                  placeholder="e.g. v1.0 Public Launch"
                  value={roadmapName}
                  onChange={(e) => setRoadmapName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canProceed) next(); }}
                />
                <span className="hint">You can rename it later from the workspace header.</span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <span className="wizard-eyebrow">Step 3 of 4 · How storage works</span>
              <h2>This roadmap stays on your device.</h2>
              <p className="sub">Nothing leaves your machine until you choose to share it.</p>
              <div className="local-note">
                <div className="glyph"><Icon name="device" size={20} stroke="#fff"/></div>
                <div className="body">
                  <div className="t">Local-first by default</div>
                  <div className="d">Saves to your browser's local storage. Works offline. Survives restarts.</div>
                </div>
              </div>
              <div className="bullet-list">
                <div className="row">
                  <span className="dot"><Icon name="check" size={12}/></span>
                  <div className="text"><b>Export anytime</b> to a portable JSON file — the same format AI agents read.</div>
                </div>
                <div className="row">
                  <span className="dot"><Icon name="check" size={12}/></span>
                  <div className="text"><b>Save to a server later</b> to unlock real-time collaboration and activity logs.</div>
                </div>
                <div className="row">
                  <span className="dot"><Icon name="check" size={12}/></span>
                  <div className="text"><b>Collaboration is optional.</b> If you stay local, you stay local. No nags.</div>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <span className="wizard-eyebrow">Step 4 of 4 · Ready</span>
              <h2>Ready to forge.</h2>
              <p className="sub">We'll open <b style={{ color: "var(--ink)" }}>{roadmapName.trim() || "your roadmap"}</b> with a starter set of phases. Edit anything, delete anything — it's yours.</p>
              <div className="local-note" style={{ borderColor: "rgba(217,116,66,0.30)" }}>
                <div className="glyph"><Icon name="flame" size={20} stroke="#fff"/></div>
                <div className="body">
                  <div className="t">Welcome, {displayName.trim() || "friend"}.</div>
                  <div className="d">Your roadmap is ready. Take a breath — you can move slowly. Roadforge waits.</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="wizard-foot">
          {step > 0 ? (
            <button className="back" onClick={back}>← Back</button>
          ) : (
            <button className="back" onClick={onClose}>Cancel</button>
          )}
          <span className="spacer"/>
          {step < 3 ? (
            <button className="btn primary" onClick={next} disabled={!canProceed} style={{ opacity: canProceed ? 1 : 0.5 }}>
              Continue <Icon name="arrow-right" size={15} stroke="#fff"/>
            </button>
          ) : (
            <button className="btn primary" onClick={onComplete}>
              Open roadmap <Icon name="arrow-right" size={15} stroke="#fff"/>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

window.Wizard = Wizard;
