// Roadforge — root app (homepage → wizard → workspace + flows + join + read-only)
const { useState, useEffect } = React;

function App() {
  const [view, setView] = useState("home"); // home | workspace | join | shared
  const [showWizard, setShowWizard] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [displayName, setDisplayName] = useState("");
  const [roadmapName, setRoadmapName] = useState("v1.0 Public Launch");

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  const startCreate = () => setShowWizard(true);
  const completeWizard = () => { setShowWizard(false); setView("workspace"); };

  return (
    <>
      {view === "home" && <Homepage
        onCreate={startCreate}
        onJoinDemo={() => setView("join")}
        onSharedDemo={() => setView("shared")}
      />}
      {view === "workspace" && <Workspace
        displayName={displayName || "You"} roadmapName={roadmapName || "v1.0 Public Launch"}
        theme={theme} setTheme={setTheme} onHome={() => setView("home")} mode="owner"/>}
      {view === "shared" && <Workspace
        displayName={displayName || "Guest"} roadmapName="v1.0 Public Launch"
        theme={theme} setTheme={setTheme} onHome={() => setView("home")} mode="viewer"
        onCreateOwn={() => { setView("home"); setTimeout(startCreate, 100); }}/>}
      {view === "join" && <JoinPage
        theme={theme} setTheme={setTheme}
        onJoin={(n) => { setDisplayName(n); setView("shared"); }}
        onCreateOwn={() => { setView("home"); setTimeout(startCreate, 100); }}/>}

      {(view === "home") && (
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 40 }}>
          <div className="theme-toggle">
            <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")} title="Dark"><Icon name="moon" size={14}/></button>
            <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")} title="Light"><Icon name="sun" size={14}/></button>
          </div>
        </div>
      )}

      {showWizard && <Wizard onComplete={completeWizard} onClose={() => setShowWizard(false)}
        displayName={displayName} setDisplayName={setDisplayName}
        roadmapName={roadmapName} setRoadmapName={setRoadmapName}/>}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
