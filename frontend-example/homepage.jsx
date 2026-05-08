// Roadforge — Homepage
const { useState: useStateH, useEffect: useEffectH } = React;

function MiniPreview() {
  return (
    <div className="preview-mini">
      <div className="title-line">v1.0 Public Launch</div>
      <div className="meta-line">
        <span>5 phases</span>
        <span>·</span>
        <span>4 of 19 done</span>
        <span>·</span>
        <span style={{ color: "var(--ember)" }}>1 task ready next</span>
      </div>
      <div className="phase-mini" style={{ "--phase-color": "#d97442" }}>
        <div className="ph">
          <span className="num">02</span>
          <span className="nm">Core Workspace</span>
          <span className="ct">3 / 5</span>
        </div>
        <div className="task-mini done"><span className="ck"/><span className="tt">Vertical phases with collapsible tasks</span></div>
        <div className="task-mini"><span className="ck"/><span className="tt">Inline task detail and dependencies</span><span className="pp">NEXT</span></div>
        <div className="task-mini"><span className="ck"/><span className="tt">Suggested next task</span></div>
      </div>
      <div className="phase-mini" style={{ "--phase-color": "#c97553", opacity: 0.85 }}>
        <div className="ph">
          <span className="num">03</span>
          <span className="nm">Sync & Collaboration</span>
          <span className="ct">0 / 4</span>
        </div>
      </div>
    </div>
  );
}

function Homepage({ onCreate, onJoinDemo, onSharedDemo }) {
  const [scrolled, setScrolled] = useStateH(false);
  useEffectH(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="home">
      <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
        <div className="brand">
          <div className="mark"><Icon name="anvil" size={15} stroke="#f5853f" strokeWidth={1.7}/></div>
          <span>Roadforge</span>
        </div>
        <nav>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#open-source">Open source</a>
        </nav>
        <span className="spacer"/>
        <div className="actions">
          <a className="gh-pill" href="#" onClick={(e) => e.preventDefault()}>
            <Icon name="github" size={18}/>
            <span>GitHub</span>
            <span className="stars">★ 2.4k</span>
          </a>
          <button className="btn primary" onClick={onCreate}>Create roadmap</button>
        </div>
      </header>

      <section className="hero container">
        <span className="eyebrow">
          <span className="pill">v1.0</span>
          Open-source · Self-hostable · AI-friendly
        </span>
        <h1>The roadmap tool that <span className="accent">starts on your machine.</span></h1>
        <p className="lede">
          Plan in phases. Forge your roadmap locally — no account, no sign-up. Save it to a server later if you want collaboration. Built so people and AI agents read the same file.
        </p>
        <div className="ctas">
          <button className="btn primary lg" onClick={onCreate}>
            Create roadmap <Icon name="arrow-right" size={16} stroke="#fff"/>
          </button>
          <a className="btn lg" href="#" onClick={(e) => e.preventDefault()}>
            <Icon name="github" size={16}/> View on GitHub
          </a>
        </div>
        <div className="meta-row">
          <span><Icon name="lock" size={14}/> No account required</span>
          <span><Icon name="device" size={14}/> Works offline</span>
          <span><Icon name="shield" size={14}/> MIT licensed</span>
        </div>
      </section>

      <div className="preview-wrap">
        <div className="preview">
          <div className="preview-bar">
            <span className="dots"><i/><i/><i/></span>
            <span className="url">roadforge.local · v1.0 Public Launch</span>
          </div>
          <MiniPreview/>
        </div>
      </div>

      <section className="section container" id="how">
        <div className="section-head">
          <h2>From empty page to shipped roadmap.</h2>
          <p className="section-lede">Three steps. No setup. You can be planning in under a minute.</p>
        </div>
        <div className="steps">
          <div className="step-card">
            <span className="num">STEP 01</span>
            <h3>Start locally.</h3>
            <p>Open Roadforge, name yourself, name your roadmap. Everything saves to your device — fast and private.</p>
          </div>
          <div className="step-card">
            <span className="num">STEP 02</span>
            <h3>Plan in phases.</h3>
            <p>Group work into phases. Add tasks. Note what depends on what. Collapse anything you don't need to see right now.</p>
          </div>
          <div className="step-card">
            <span className="num">STEP 03</span>
            <h3>Collaborate when ready.</h3>
            <p>Save to a Roadforge server — yours or self-hosted — to unlock real-time presence, activity logs, and signed share links.</p>
          </div>
        </div>
      </section>

      <section className="section container" id="features">
        <div className="section-head">
          <h2>Built for solo builders and small teams.</h2>
          <p className="section-lede">A small set of features, chosen carefully, sized to fit how real planning works.</p>
        </div>
        <div className="features">
          <div className="feature">
            <div className="ic"><Icon name="device" size={20}/></div>
            <h3>Local-first</h3>
            <p>Edits land on your device first. No round-trips, no spinner, no internet required.</p>
          </div>
          <div className="feature">
            <div className="ic"><Icon name="users" size={20}/></div>
            <h3>Optional collaboration</h3>
            <p>Save a roadmap to a server when you want to share. Presence, activity log, signed links.</p>
          </div>
          <div className="feature">
            <div className="ic"><Icon name="robot" size={20}/></div>
            <h3>AI-friendly schema</h3>
            <p>One stable JSON file that humans and coding agents both read. Agents propose; you approve.</p>
          </div>
          <div className="feature">
            <div className="ic"><Icon name="shield" size={20}/></div>
            <h3>Self-hostable</h3>
            <p>Single binary, SQLite by default. Deploy on any box you trust.</p>
          </div>
          <div className="feature">
            <div className="ic"><Icon name="export" size={20}/></div>
            <h3>Portable</h3>
            <p>Export to JSON or Markdown. Import from either. No lock-in, ever.</p>
          </div>
          <div className="feature">
            <div className="ic"><Icon name="github" size={20}/></div>
            <h3>Open source</h3>
            <p>MIT-licensed and built in public. Fork it, fix it, ship it your way.</p>
          </div>
        </div>
      </section>

      <section className="container" id="open-source">
        <div className="cta-banner">
          <h2>Forge your first roadmap.</h2>
          <p>It runs on your machine. It costs nothing. You're a minute away.</p>
          <div className="ctas" style={{ justifyContent: "center" }}>
            <button className="btn primary lg" onClick={onCreate}>
              Create roadmap <Icon name="arrow-right" size={16} stroke="#fff"/>
            </button>
            <a className="btn lg" href="#" onClick={(e) => e.preventDefault()}>
              <Icon name="github" size={16}/> Star on GitHub
            </a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="row">
          <div className="brand">
            <div className="mark"><Icon name="anvil" size={15} stroke="#f5853f" strokeWidth={1.7}/></div>
            <span>Roadforge</span>
          </div>
          <span style={{ color: "var(--ink-4)" }}>·</span>
          <span>MIT licensed · v1.0</span>
          <span className="flex-1"/>
          <div className="links">
            <a href="#" onClick={(e) => { e.preventDefault(); onJoinDemo(); }}>Demo: join invite</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onSharedDemo(); }}>Demo: read-only view</a>
            <a href="#" onClick={(e) => e.preventDefault()}>Docs</a>
            <a href="#" onClick={(e) => e.preventDefault()}>Self-host guide</a>
            <a href="#" onClick={(e) => e.preventDefault()}>GitHub</a>
          </div>
        </div>
        <div className="row sub">
          <span>© 2026 Roadforge contributors · MIT licensed</span>
          <span className="flex-1"/>
          <span>Built locally. Optionally yours to host.</span>
        </div>
      </footer>
    </div>
  );
}

window.Homepage = Homepage;
