# Roadforge

A structured roadmap tool for indie hackers and small teams. Break your release into phases, track task dependencies, and share a read-only view with stakeholders.

**Status:** Frontend-only, backend-ready foundation. All UI is functional locally. No auth, database, or real-time collaboration yet.

---

## Stack

| Layer | Technology |
|---|---|
| Workspace | pnpm workspace |
| Framework | Next.js 15 App Router |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v3 + CSS custom properties |
| Fonts | Lexend (display/body) + JetBrains Mono (mono) via `next/font` |
| Persistence | `localStorage` (client-side only) |

---

## Local development

```bash
# Install dependencies (from repo root)
pnpm install

# Run dev server
pnpm dev

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build
```

All commands run against `apps/web` via the root `package.json` scripts.

---

## Routes

| Route | Component | Description |
|---|---|---|
| `/` | `Homepage` | Marketing page with hero, how-it-works, features |
| `/workspace` | `Workspace` (owner mode) | Editable roadmap view |
| `/shared` | `Workspace` (viewer mode) | Read-only roadmap view with viewer banner |
| `/join` | `JoinPage` | Accept a share-link invite (mocked) |

---

## What works locally

- **Local persistence** — Display name, roadmap name, phases/tasks, saved status, and theme are persisted to `localStorage`. State survives page refresh.
- **Theme persistence** — Dark/light mode preference is saved and restored on load.
- **JSON export** — Downloads the current roadmap as `roadmap.json` using the Blob API.
- **JSON import** — Pick a Roadforge JSON file from disk; validates shape, updates state and `localStorage`.
- **Reset** — "Reset to sample roadmap" in the IO modal clears `localStorage` and restores the built-in sample data.
- **Task completion** — Check/uncheck tasks; progress bar and done count update live.
- **Phase collapse** — Expand/collapse individual phases or all at once.
- **Search** — Filter tasks across all phases by title, ID, or tag.
- **Wizard** — 4-step create flow collects display name and roadmap title.

---

## What is mocked

| Feature | Status |
|---|---|
| Save to server | Modal shown, no HTTP call |
| Share links | URL shown, no server-side storage |
| Join via link | Form shown, no token validation |
| Markdown export | Toasts "requires backend" |
| PDF export | Toasts "requires backend" |
| Agent bundle export | Toasts "requires backend" |
| Markdown import | Toasts "requires backend" |
| Real-time collaboration | No WebSocket infrastructure |

---

## Backend integration

When a backend is ready, integration points are marked with `// TODO(backend):` throughout `apps/web/src/services/roadmap.service.ts`. Each function has a corresponding HTTP comment describing the expected endpoint.

See [`docs/frontend-foundation.md`](docs/frontend-foundation.md) for the full architecture reference.

---

## Project structure

```
roadforge/
├── apps/
│   └── web/                  # Next.js app (the real frontend)
│       └── src/
│           ├── app/           # Next.js App Router routes
│           ├── components/    # UI components by feature
│           ├── context/       # React contexts (Roadmap, Theme)
│           ├── data/          # Sample data and export options
│           ├── hooks/         # Custom hooks
│           ├── lib/           # Utilities (storage.ts)
│           ├── services/      # Service layer with TODO(backend) stubs
│           ├── styles/        # CSS files (split by concern)
│           └── types/         # TypeScript types
└── docs/                     # Architecture documentation
```
