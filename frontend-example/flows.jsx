// Roadforge — flow modals & extra views: Save, Share, Import/Export, Join, Read-only
const { useState: useStateF, useEffect: useEffectF } = React;

/* ---------------- ModalShell ---------------- */
function Modal({ open, onClose, icon, title, sub, children, footer, width }) {
  useEffectF(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className="modal" style={width ? { width } : null} role="dialog" aria-modal="true">
        <div className="modal-head">
          {icon && <div className={`ic ${icon.plain ? "plain" : ""}`}><Icon name={icon.name} size={20} stroke={icon.plain ? "var(--ember)" : "#fff"}/></div>}
          <div className="text">
            <h2>{title}</h2>
            {sub && <p className="sub">{sub}</p>}
          </div>
          <button className="close" onClick={onClose} aria-label="Close"><Icon name="x" size={16}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- Save to Server ---------------- */
function SaveToServerModal({ open, onClose, onConfirm }) {
  return (
    <Modal
      open={open} onClose={onClose}
      icon={{ name: "cloud" }}
      title="Save this roadmap to your server"
      sub="Saving to a Roadforge server unlocks collaboration. Your local copy stays on this device as a fallback."
      footer={<>
        <button className="back" onClick={onClose}>Stay local</button>
        <span className="spacer"/>
        <button className="btn primary" onClick={onConfirm}>
          Save and enable collaboration <Icon name="arrow-right" size={15} stroke="#fff"/>
        </button>
      </>}
    >
      <div className="save-illus">
        <div className="node">
          <div className="glyph"><Icon name="device" size={20} stroke="#fff"/></div>
          <span className="lbl">This device</span>
        </div>
        <div className="arrow"><span className="line"/></div>
        <div className="node">
          <div className="glyph"><Icon name="cloud" size={20} stroke="#fff"/></div>
          <span className="lbl">Your server</span>
        </div>
      </div>
      <div className="bullet"><span className="dot"><Icon name="users" size={13}/></span>
        <span className="text"><b>Collaboration unlocks.</b> Invite editors and viewers through secure links — no accounts required for them either.</span>
      </div>
      <div className="bullet"><span className="dot"><Icon name="activity" size={13}/></span>
        <span className="text"><b>Activity log becomes available.</b> See who changed what, scoped to this roadmap.</span>
      </div>
      <div className="bullet"><span className="dot"><Icon name="export" size={13}/></span>
        <span className="text"><b>You can still export.</b> JSON, Markdown, and PDF stay one click away.</span>
      </div>
      <div className="bullet"><span className="dot"><Icon name="lock" size={13}/></span>
        <span className="text"><b>Optional, always.</b> You can switch back to local-only at any time.</span>
      </div>
      <div className="note-line">
        <span className="ic"><Icon name="shield" size={14}/></span>
        <span>You're saving to <span className="mono" style={{ color: "var(--ink)" }}>roadforge.local:7878</span> — your self-hosted server. Configure a different endpoint in settings.</span>
      </div>
    </Modal>
  );
}

/* ---------------- Share Roadmap ---------------- */
function ShareModal({ open, onClose }) {
  const [copied, setCopied] = useStateF(null);
  const links = [
    { id: "owner", role: "Owner", icon: "shield", desc: "Full control — manage settings, links, and members.", url: "https://roadforge.local/r/v1-launch?k=ow_8hQ2…N3a", recommended: false },
    { id: "editor", role: "Editor invite", icon: "users", desc: "Can edit phases, tasks, and dependencies. Cannot delete the roadmap.", url: "https://roadforge.local/r/v1-launch?k=ed_2bD7…XqL", recommended: true },
    { id: "viewer", role: "Viewer (read-only)", icon: "circle", desc: "Can read everything but not change anything. Good for stakeholders.", url: "https://roadforge.local/r/v1-launch?k=vi_91Hp…W4z", recommended: false },
  ];
  const copy = (id, url) => {
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1600);
  };
  return (
    <Modal
      open={open} onClose={onClose} width={580}
      icon={{ name: "share", plain: true }}
      title="Share this roadmap"
      sub="Anyone with a link can join with the role you choose. Links are signed and revocable."
      footer={<>
        <span className="note"><Icon name="lock" size={12}/> Share links carefully — anyone with a link can join.</span>
        <span className="spacer"/>
        <button className="btn" onClick={onClose}>Done</button>
      </>}
    >
      <div className="share-list">
        {links.map(l => (
          <div key={l.id} className={`share-row ${l.recommended ? "recommended" : ""}`}>
            <div className="ic"><Icon name={l.icon} size={16}/></div>
            <div className="meta">
              <div className="h">
                {l.role}
                {l.recommended && <span className="badge ember">Recommended</span>}
              </div>
              <div className="d">{l.desc}</div>
            </div>
            <div className="link-line">
              <code>{l.url}</code>
              <button className={`copy ${copied === l.id ? "copied" : ""}`} onClick={() => copy(l.id, l.url)}>
                {copied === l.id ? <><Icon name="check" size={13}/> Copied</> : <><Icon name="link" size={13}/> Copy</>}
              </button>
            </div>
            <div className="actions">
              <button className="mini"><Icon name="link" size={12}/> Regenerate</button>
              <button className="mini"><Icon name="x" size={12}/> Revoke</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------- Import / Export ---------------- */
function IOModal({ open, onClose, onToast }) {
  const [tab, setTab] = useStateF("export");
  const exports = [
    { id: "json", icon: "code", name: "JSON", badge: "Source of truth", desc: "The portable, AI-friendly format. Re-import anywhere with no loss." },
    { id: "md", icon: "doc", name: "Markdown", desc: "Human-readable. Great for READMEs and pull requests." },
    { id: "pdf", icon: "doc", name: "PDF", desc: "A polished, print-ready snapshot of the current roadmap." },
    { id: "agent", icon: "robot", name: "Agent bundle", desc: "JSON plus a short prompt preface — drop into any agent context." },
  ];
  const trigger = (label) => { onToast(`${label} downloaded`); onClose(); };
  return (
    <Modal
      open={open} onClose={onClose} width={580}
      icon={{ name: tab === "export" ? "export" : "import", plain: true }}
      title={tab === "export" ? "Export roadmap" : "Import roadmap"}
      sub="JSON is the portable source-of-truth format. Markdown and PDF are read-only snapshots."
      footer={<>
        <span className="note">No data leaves your device.</span>
        <span className="spacer"/>
        <button className="back" onClick={onClose}>Cancel</button>
      </>}
    >
      <div className="io-tab">
        <button className={tab === "export" ? "active" : ""} onClick={() => setTab("export")}>Export</button>
        <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>Import</button>
      </div>
      {tab === "export" ? (
        <div className="io-grid">
          {exports.map(e => (
            <button key={e.id} className={`io-card ${e.id === "json" ? "recommended" : ""}`} onClick={() => trigger(`${e.name} file`)}>
              <div className="h">
                <span className="ic"><Icon name={e.icon === "robot" ? "robot" : e.icon === "doc" ? "export" : "export"} size={14}/></span>
                <span className="nm">{e.name}</span>
                {e.badge && <span className="badge">{e.badge}</span>}
              </div>
              <div className="d">{e.desc}</div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="io-grid">
            <button className="io-card recommended" onClick={() => trigger("JSON imported")}>
              <div className="h">
                <span className="ic"><Icon name="import" size={14}/></span>
                <span className="nm">From JSON</span>
                <span className="badge">Recommended</span>
              </div>
              <div className="d">Drag a Roadforge JSON file or pick from disk.</div>
            </button>
            <button className="io-card" onClick={() => trigger("Markdown imported")}>
              <div className="h">
                <span className="ic"><Icon name="import" size={14}/></span>
                <span className="nm">From Markdown</span>
              </div>
              <div className="d">A simple checklist file with phase headings.</div>
            </button>
          </div>
          <div className="note-line">
            <span className="ic"><Icon name="shield" size={14}/></span>
            <span>Importing replaces the current roadmap. We'll keep an undo for one minute.</span>
          </div>
        </>
      )}
    </Modal>
  );
}

window.SaveToServerModal = SaveToServerModal;
window.ShareModal = ShareModal;
window.IOModal = IOModal;
