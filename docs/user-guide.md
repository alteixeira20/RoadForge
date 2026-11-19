# RoadForge User Guide

RoadForge by Anvilary Tools is a local-first, privacy-respecting roadmap and planning tool built for developers, indie creators, and agile teams.

With RoadForge, you can organize ambitious projects into clear phases, break down complex work into tasks and subtasks, track progress, map dependencies, and export portable backups, all without creating an account or sending data to third-party tracking services.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Getting Started](#getting-started)
3. [Workspace Overview](#workspace-overview)
4. [Phases and Milestones](#phases-and-milestones)
5. [Tasks and Work Items](#tasks-and-work-items)
6. [Subtasks and Hierarchies](#subtasks-and-hierarchies)
7. [Dependencies and Blocking Logic](#dependencies-and-blocking-logic)
8. [Tags, Search, and Filtering](#tags-search-and-filtering)
9. [Tracking Progress](#tracking-progress)
10. [Local-First Persistence and Recovery](#local-first-persistence-and-recovery)
11. [Import, Export, and Backups](#import-export-and-backups)
12. [Collaboration and Server Sync](#collaboration-and-server-sync)
13. [Model Context Protocol (MCP) Integration](#model-context-protocol-mcp-integration)
14. [Keyboard Navigation and Shortcuts](#keyboard-navigation-and-shortcuts)

---

## Core Principles

- **Local first:** Your roadmap lives in your browser by default. You can create, organize, edit, and track projects immediately without signing up, entering an email, or connecting to an external API.
- **No accounts:** You do not need to remember a password or manage user credentials for personal roadmaps. When you choose to collaborate with others, access is governed by scoped cryptographic bearer tokens for Owners, Editors, and Viewers.
- **Portability:** RoadForge never locks your data into a proprietary silo. You can export complete canonical JSON backups anytime, along with formatted Markdown summaries for sharing or documentation.
- **Explicit sync:** Moving a roadmap from your browser to a shared server is a deliberate, explicit action. The application never uploads your private roadmaps without your command.
- **Simplicity by design:** Focused on clean, visual execution. Features serve your planning flow rather than overwhelming you with enterprise configuration menus.

---

## Getting Started

### 1. Launching the Application

Visit your RoadForge instance (such as the official reference demo at `roadforge.anvilary.tools` or your self-hosted instance).

From the landing page, click **Create roadmap** in the header or the hero section.

### 2. The Creation Wizard

The creation wizard guides you through setup in two lightweight steps:

1. **Identity & Title:**
   - **Your display name:** Enter the name collaborators will see during edits (for example, `Developer` or `Alex`).
   - **Roadmap title:** Give your roadmap a descriptive name (for example, `Launching a Developer Tool`).
   - Click **Continue**.

2. **Starting Point:**
   - **Start blank:** Begins with a clean single phase (`Planning`) ready for custom milestones.
   - **Starter example:** Loads a pre-populated three-phase roadmap (`Define the outcome`, `Build and test`, `Release and learn`) illustrating best practices.
   - Click **Create roadmap** to enter the workspace.

---

## Workspace Overview

The RoadForge workspace is organized into intuitive functional areas:

- **Application Header:** Displays the RoadForge brand mark, the current roadmap title (which you can click to rename), active collaboration indicators, the **Import / Export** modal trigger, the **Share** menu (for synced roadmaps), and issue reporting links.
- **Workspace Navigation Bar:** Contains tabs to toggle between the primary **Roadmap** view and the **Tags** registry, plus an **Activity** log drawer.
- **Workspace Tools Bar:** Provides real-time task search, status and complexity filter dropdowns, and buttons to quickly **Expand all** or **Collapse all** phases.
- **Phase List:** The vertical flow of project phases, each containing its progress bar, color settings, phase actions, and organized task cards.
- **Site Footer:** Identifies the parent brand, **Anvilary Tools**, linking to parent company resources, documentation, and licensing information.

---

## Phases and Milestones

Phases represent high-level stages or milestones of your project lifecycle (such as Planning, Development, Testing, and Release).

### Adding and Renaming Phases
- Click **Add another phase** at the bottom of the phase list.
- Type the name for the new phase and press **Enter**.
- To rename an existing phase, click the phase header title directly or choose **Rename** from the phase settings menu (`...`).

### Phase Colors
- Each phase has a distinct accent color used for its progress indicator, milestone headers, and visual grouping.
- RoadForge provides both an automatic color harmony engine and manual color pickers.
- Click the phase settings menu (`...`) and select **Change color** to switch between preset color palettes, enter a custom hex color, or toggle automatic mode.

### Reordering Phases
- Use the drag handle on the left of any phase header to drag and drop phases into your preferred chronological sequence.
- Keyboard users can focus the phase drag handle and press Space followed by Arrow Up or Arrow Down to reorder phases accessibly.

---

## Tasks and Work Items

Tasks represent the actionable deliverables within each phase.

### Creating Tasks
- In an empty phase, click **Add first task**.
- In an existing phase, click **Add task** at the bottom of the task list.
- Type the task title and press **Enter** to create it immediately.

### Task Details and Metadata
Clicking any task row expands its detail card, where you can configure:
- **Title:** Edit the concise name of the deliverable.
- **Complexity:** Select from `Low`, `Medium`, `High`, or `Very high`. RoadForge uses complexity as the primary estimation signal. `Very high` complexity automatically prompts you to break the task down into subtasks.
- **Time Estimate:** Optional heuristic duration (for example, `2d`, `4h`, or `1w`).
- **Description:** A rich markdown editor with formatting toolbar supporting headers, lists, inline code, bold, italic, and links.
- **Tags:** Categorical labels for cross-cutting concerns (for example, `Frontend`, `API`, `Security`, `Docs`).
- **Assignees:** Names of team members responsible for executing the task.

---

## Subtasks and Hierarchies

When a task involves multiple distinct steps, subtasks break it down into a checklist without cluttering the top-level roadmap.

### Working with Subtasks
1. Click the parent task to expand its details.
2. Click **Add subtask**.
3. Type the subtask title and click **Add** (or press Enter).
4. Subtasks feature their own completion checkboxes and display numbers (for example, `1.1`, `1.2`).
5. Drag and drop subtasks using their grip handles to reorder execution sequence.
6. When all subtasks are marked complete, the parent task reflects finished sub-deliverables.

---

## Dependencies and Blocking Logic

RoadForge includes a built-in directed graph engine that tracks relationships between interdependent tasks.

### Linking Dependencies
1. Expand the task that depends on another task (for example, `Publish initial release candidate`).
2. Click **Link dependency**.
3. Use the search input to locate the prerequisite task (for example, `Run Playwright end-to-end browser tests`).
4. Click the candidate task to link them.

### Blocked Status and Safety
- If a prerequisite task is incomplete, the dependent task shows an amber **Blocked** status badge.
- RoadForge automatically computes transitive dependencies.
- **Cycle Prevention:** RoadForge validates every dependency graph update in real time. If adding a link would create a circular dependency (Task A depends on Task B which depends on Task A), the invalid link is prevented, keeping your timeline deterministic.
- Once all prerequisite tasks are checked off, the blocked indicator clears, signaling that work is ready to proceed.

---

## Tags, Search, and Filtering

As roadmaps expand, finding specific work items quickly is critical.

### Real-Time Search
The search input in the workspace toolbar filters tasks instantaneously by title, ID, tag, or description across all phases simultaneously. Clear the input to restore the full view.

### The Tag Registry
Click the **Tags** tab in the navigation bar to manage the project-wide tag registry:
- Create unified tags with distinct colors.
- Rename tags or adjust their palette colors across all associated tasks in a single operation.
- Review task counts for each tag to assess resource allocation across functional areas.

---

## Tracking Progress

RoadForge provides real-time visual progress feedback:

- **Checkboxes:** Clicking a task or subtask checkbox toggles completion status.
- **Phase Progress Bars:** Each phase header displays a percentage bar reflecting the ratio of completed tasks in that phase.
- **Overall Roadmap Progress:** The top workspace header tracks aggregate completion across the entire project.
- **Strike-through and Visual Tone:** Completed tasks render with subtle dimmed styling and strike-through titles, making active work stand out clearly.

---

## Local-First Persistence and Recovery

RoadForge prioritizes data ownership and resilience:

- **Instant Local Saves:** Every title change, task creation, reorder, or checkbox toggle writes immediately to browser `localStorage`.
- **Survives Reloads and Crashes:** Refreshing your browser, restarting your operating system, or navigating away preserves your complete roadmap state.
- **Offline Capable:** You can use RoadForge completely disconnected from the Internet; all core editing, filtering, and reordering functions work entirely client-side.
- **Draft Protection:** In-progress task descriptions and draft rows are shielded against unexpected navigation loss.

---

## Import, Export, and Backups

Because browser cache can be cleared by privacy extensions or system maintenance tools, regular backups are strongly recommended.

### Accessing Import / Export
Click the **Import / Export** button in the top navigation header.

### Exporting Your Data
- **Download `.roadforge.json` (Recommended):** The authoritative, complete backup of your roadmap. Includes all phases, tasks, subtasks, descriptions, tags, dependencies, and layout preferences. This file can be re-imported into any RoadForge instance at any time.
- **Download readable Markdown:** Generates a clean, human-readable document formatting your entire roadmap into markdown tables, headers, and checklists. Ideal for repository `README` updates, status reports, or sharing in issues and pull requests.
- **Download roadmap generator template:** A specialized prompt and schema definition designed for feeding roadmap data into Large Language Models (LLMs) or AI coding agents.

### Importing a Roadmap
1. Open the **Import / Export** dialog and select the **Import** tab.
2. Click **Choose JSON file** and select a valid `.roadforge.json` file.
3. RoadForge validates the schema structure, verifies phase consistency, and renders the imported project immediately.

---

## Collaboration and Server Sync

When you want to collaborate with teammates in real time, you can sync your local roadmap to a RoadForge backend server.

### The Scoped Role Model
RoadForge deliberately avoids account systems, using cryptographic bearer credentials:

| Role | Permissions |
| --- | --- |
| **Owner** | Full control: edit content, manage participants, restore version snapshots, override task claims, delete roadmap. |
| **Editor** | Content control: create/edit/delete tasks and phases, claim tasks, link dependencies. |
| **Viewer** | Read-only access: view roadmap structure, inspect details, watch live changes in real time. |

### Real-Time Features
- **Live Updates:** Changes made by teammates stream instantly via Server-Sent Events (SSE).
- **Edit Locks:** Opening a task editor acquires a transient edit lock, preventing teammates from unintentionally overwriting active edits.
- **Task Claiming:** Contributors can claim specific tasks to signal active ownership to the team.
- **Version History & Restore:** Owners can inspect snapshot history and roll back accidental deletions.

---

## Model Context Protocol (MCP) Integration

RoadForge includes native Model Context Protocol (MCP) server support, allowing AI development agents (such as Claude, Antigravity, or custom LLM tooling) to interact directly with your roadmaps.

### Capabilities Provided to AI Agents
- Inspecting roadmap phases, tasks, dependencies, and completion status.
- Adding proposed implementation tasks based on project specifications.
- Checking off completed deliverables when test suites pass.
- Exporting structured task trees into sprint plans or architecture documents.

### Security and Transports
- **Local stdio transport (`packages/roadforge-mcp`):** Secure, sandboxed communication for local CLI agents with zero network exposure.
- **Remote HTTP Gateway:** Standards-compliant MCP streaming with Origin validation, DNS-rebinding protection, and cryptographic team authorization tokens.

---

## Keyboard Navigation and Shortcuts

RoadForge is built to adhere to modern accessibility and power-user standards:

| Action | Shortcut / Interaction |
| --- | --- |
| **Submit New Task / Phase** | `Enter` inside draft input |
| **Discard Draft / Close Dialog** | `Escape` |
| **Toggle Task Details** | `Space` or `Enter` on task row |
| **Toggle Task Checkbox** | `Space` or `Enter` on checkbox control |
| **Accessible Drag and Drop** | Focus drag grip handle, press `Space` to grab, `Arrow Up` / `Arrow Down` to reorder, `Space` to drop |
| **Format Markdown Bold** | `Ctrl + B` (or `Cmd + B`) |
| **Format Markdown Italic** | `Ctrl + I` (or `Cmd + I`) |
| **Format Markdown Code** | `Ctrl + E` (or `Cmd + E`) |
| **Search Tasks** | Click search box or tab to toolbar search field |

---

## Need Assistance or Found a Bug?

- **Issue Tracker:** Report issues, feedback, or feature requests via GitHub Issues.
- **Documentation:** Review additional technical references under the `/docs` directory.
- **Parent Brand:** Visit [Anvilary Tools](https://anvilary.tools/) for developer tools, utilities, and updates.
