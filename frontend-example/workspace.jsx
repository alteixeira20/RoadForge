// Roadforge — workspace (vertical, collapsible phases) + read-only mode
const { useState: useStateWS, useMemo: useMemoWS } = React;

function TaskRow({ t, expanded, onToggle, onCheck, allTasks, readOnly }) {
  const depTasks = (t.deps || []).map(id => allTasks.find(x => x.id === id)).filter(Boolean);
  const blockedBy = depTasks.filter(d => !d.done);

  return (
    <div
      className={`task ${expanded ? "expanded" : ""} ${t.done ? "done" : ""} ${t.next ? "next" : ""}`}
      onClick={(e) => { if (e.target.closest(".check")) return; onToggle(t.id); }}
    >
      <div className="task-row">
        <div className="check" onClick={(e) => { e.stopPropagation(); if (!readOnly) onCheck(t.id); }}
          style={readOnly ? { cursor: "not-allowed", opacity: 0.6 } : null}/>
        <div className="title">{t.title}</div>
        {t.next && !t.done && <span className="next-pip">Next</span>}
        {blockedBy.length > 0 && <span className="meta-pill blocked">⊘ Blocked</span>}
        {t.est && !blockedBy.length && <span className="meta-pill">{t.est}</span>}
        <span className="id">{t.id}</span>
      </div>
      {expanded && (
        <div className="task-detail" onClick={(e) => e.stopPropagation()}>
          {t.desc && <div className="desc">{t.desc}</div>}
          <div className="grid">
            <div className="label">Estimate</div>
            <div className="value">{t.est || "—"}</div>
            <div className="label">Owner</div>
            <div className="value" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="avatar" style={{ width: 20, height: 20, fontSize: 10 }}>YO</span> You
            </div>
            {(t.tags || []).length > 0 && (
              <>
                <div className="label">Tags</div>
                <div className="value">{(t.tags || []).map(g => `#${g}`).join("  ")}</div>
              </>
            )}
          </div>
          {depTasks.length > 0 && (
            <div>
              <div className="label" style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 8 }}>Depends on</div>
              <div className="deps">
                {depTasks.map(d => (
                  <div key={d.id} className="dep-row">
                    <Icon name={d.done ? "circle-check" : "circle"} size={14} stroke={d.done ? "var(--ink-3)" : "var(--ember)"}/>
                    <span>{d.title}</span>
                    <span className="did">{d.id}</span>
                    <span className={`dst ${d.done ? "done" : "ready"}`}>{d.done ? "done" : "ready"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!readOnly && (
            <div className="actions">
              <button className="btn sm"><Icon name="plus" size={13}/> Add subtask</button>
              <button className="btn sm"><Icon name="link" size={13}/> Link dependency</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Phase({ phase, openPhases, togglePhase, expandedTaskId, onToggleTask, onCheckTask, allTasks, readOnly }) {
  const isOpen = openPhases.includes(phase.id);
  const isActive = phase.status === "active";
  const done = phase.tasks.filter(t => t.done).length;

  return (
    <div className={`phase ${isOpen ? "expanded" : ""} ${isActive ? "active-phase" : ""}`} style={{ "--phase-color": phase.color }}>
      <div className="phase-head" onClick={() => togglePhase(phase.id)}>
        <span className="chev"><Icon name="chevron-right" size={16}/></span>
        <span className="num">{phase.num}</span>
        <span className="name">{phase.name}</span>
        <span className={`status ${isActive ? "active" : ""}`}>
          {phase.status === "done" ? "Complete" : phase.status === "active" ? "In progress" : phase.status === "next" ? "Up next" : "Future"}
        </span>
        <span className="progress-mini" style={{ "--p": `${phase.progress}%` }}><i/></span>
        <span className="count">{done}/{phase.tasks.length}</span>
      </div>
      {isOpen && (
        <div className="phase-body">
          {phase.tasks.map(t => (
            <TaskRow key={t.id} t={t} expanded={expandedTaskId === t.id}
              onToggle={onToggleTask} onCheck={onCheckTask} allTasks={allTasks} readOnly={readOnly}/>
          ))}
        </div>
      )}
    </div>
  );
}

function Workspace({ displayName, roadmapName, theme, setTheme, onHome, mode = "owner", onCreateOwn }) {
  const readOnly = mode === "viewer";
  const [phases, setPhases] = useStateWS(window.ROADMAP.phases);
  const [openPhases, setOpenPhases] = useStateWS(["p2"]);
  const [expandedTaskId, setExpandedTaskId] = useStateWS("RF-05");
  const [toast, setToast] = useStateWS(null);
  const [saved, setSaved] = useStateWS(false);
  const [showSave, setShowSave] = useStateWS(false);
  const [showShare, setShowShare] = useStateWS(false);
  const [showIO, setShowIO] = useStateWS(false);

  const allTasks = useMemoWS(() => phases.flatMap(p => p.tasks), [phases]);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2400); };
  const togglePhase = (id) => setOpenPhases(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const collapseAll = () => setOpenPhases([]);
  const expandAll = () => setOpenPhases(phases.map(p => p.id));
  const allOpen = openPhases.length === phases.length;
  const onToggleTask = (id) => setExpandedTaskId(prev => prev === id ? null : id);
  const onCheckTask = (id) => {
    if (readOnly) return;
    setPhases(prev => prev.map(p => ({ ...p, tasks: p.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) })));
  };
  const totalDone = allTasks.filter(t => t.done).length;
  const initials = ((displayName || "You").split(" ").map(w => w[0]).slice(0,2).join("") || "Y").toUpperCase();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mini" onClick={onHome} style={{ cursor: "pointer" }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: "linear-gradient(180deg, #2a2018, #161114)",
            border: "1px solid var(--border-strong)",
            display: "grid", placeItems: "center", position: "relative", overflow: "hidden"
          }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 110%, var(--molten), transparent 60%)", opacity: 0.95 }}/>
            <Icon name="anvil" size={13} stroke="#f5853f" strokeWidth={1.7}/>
          </div>
          <span>Roadforge</span>
        </div>
        <div className="crumbs">
          <span>Roadforge</span>
          <span className="sep">/</span>
          <span className="active">{roadmapName}</span>
        </div>
        {!readOnly && (
          <span className={`badge ${saved ? "synced" : ""}`}>
            <span className="dot"/>{saved ? "SYNCED" : "LOCAL ONLY"}
          </span>
        )}
        {readOnly && <span className="badge"><span className="dot"/>READ ONLY</span>}
        <span className="spacer"/>
        <div className="actions">
          {!readOnly && <>
            <button className="iconbtn" title="Import / Export" onClick={() => setShowIO(true)}><Icon name="export" size={16}/></button>
            <button className="iconbtn" title="Share" onClick={() => saved ? setShowShare(true) : setShowSave(true)}><Icon name="share" size={16}/></button>
            {!saved
              ? <button className="btn sm" onClick={() => setShowSave(true)}><Icon name="cloud" size={14}/> Save to server</button>
              : <button className="btn sm" onClick={() => setShowShare(true)}><Icon name="share" size={14}/> Share</button>}
          </>}
          {readOnly && <button className="btn sm primary" onClick={onCreateOwn}><Icon name="plus" size={14} stroke="#fff"/> Create your own</button>}
          <div className="theme-toggle">
            <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")} title="Dark"><Icon name="moon" size={14}/></button>
            <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")} title="Light"><Icon name="sun" size={14}/></button>
          </div>
          <span className="avatar" title={displayName}>{initials}</span>
        </div>
      </header>

      {readOnly && (
        <div className="readonly-banner">
          <span className="pill"><Icon name="circle" size={11}/> Viewer</span>
          <span className="who">You're viewing <b>{roadmapName}</b> as a read-only guest. Owner: <b>Ada Lovelace</b>.</span>
          <span className="spacer"/>
          <button className="btn sm" onClick={onCreateOwn}><Icon name="plus" size={13}/> Create your own roadmap</button>
        </div>
      )}

      <div className="workspace">
        <div className="workspace-head">
          <div className="crumbline">Roadmap</div>
          <h1>{roadmapName}</h1>
          <div className="meta">
            <span><Icon name="circle-check" size={14}/> {totalDone} of {allTasks.length} done</span>
            <span>{phases.length} phases</span>
            <span className="ember"><Icon name="flame" size={14} stroke="var(--ember)"/> 1 task ready next</span>
            {saved && <span><Icon name="users" size={14}/> 2 collaborators</span>}
          </div>
        </div>

        <div className="workspace-bar">
          <div className="search">
            <Icon name="search" size={15} stroke="var(--ink-3)"/>
            <input placeholder="Search this roadmap…"/>
            <span className="kbd">⌘ K</span>
          </div>
          <button className="collapse-all" onClick={allOpen ? collapseAll : expandAll}>
            <Icon name="fold" size={14}/> {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>

        <div className="phases">
          {phases.map(p => (
            <Phase key={p.id} phase={p} openPhases={openPhases} togglePhase={togglePhase}
              expandedTaskId={expandedTaskId} onToggleTask={onToggleTask} onCheckTask={onCheckTask}
              allTasks={allTasks} readOnly={readOnly}/>
          ))}
        </div>

        {!readOnly && (
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
            <button className="btn ghost"><Icon name="plus" size={14}/> Add phase</button>
          </div>
        )}
      </div>

      <SaveToServerModal open={showSave} onClose={() => setShowSave(false)}
        onConfirm={() => { setSaved(true); setShowSave(false); showToast("Saved · collaboration enabled"); }}/>
      <ShareModal open={showShare} onClose={() => setShowShare(false)}/>
      <IOModal open={showIO} onClose={() => setShowIO(false)} onToast={showToast}/>

      {toast && <div className="toast"><span className="dot"/>{toast}</div>}
    </div>
  );
}

window.Workspace = Workspace;
