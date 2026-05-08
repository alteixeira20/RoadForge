# Roadforge — Claude Code guidance

## Project purpose

Roadforge is a structured roadmap tool (frontend-only foundation). The codebase is a clean, backend-ready Next.js 15 app with full UI, local persistence, and service stubs ready for HTTP wiring.

## Stack

- **pnpm workspace** — root scripts delegate to `apps/web` via `--filter web`
- **Next.js 15 App Router** — `apps/web/src/app/` holds all routes
- **TypeScript 5** — strict mode, path alias `@/` maps to `src/`
- **Tailwind CSS v3** — utility classes available; most styling is in `src/styles/*.css`
- **Fonts** — Lexend + JetBrains Mono loaded via `next/font/google` in `layout.tsx`

## Commands (run from repo root)

```bash
pnpm dev          # Start dev server (apps/web)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
```

## Folder structure

```
apps/web/src/
├── app/            # Routes: /, /workspace, /shared, /join
├── components/     # UI components, grouped by feature
│   ├── home/       # Homepage sections
│   ├── join/       # Join page
│   ├── layout/     # AppHeader, SiteHeader, SiteFooter
│   ├── roadmap/    # Workspace, Phase, TaskRow, sub-components
│   ├── share/      # SaveToServerModal, ShareModal, IOModal
│   ├── ui/         # Icon, Modal, Brand, Toast, ThemeToggle
│   └── wizard/     # CreateWizard (4-step form)
├── context/        # RoadmapContext, ThemeContext
├── data/           # sample-roadmap.ts, EXPORT_OPTIONS
├── hooks/          # useWorkspaceModals, usePhaseCollapse, usePhaseSearch, useToastState
├── lib/            # storage.ts (localStorage helpers)
├── services/       # roadmap.service.ts (all TODO(backend) stubs)
├── styles/         # CSS split: tokens, base, ui, site, workspace, modals, join
└── types/          # roadmap.ts, ui.ts
```

## Hard rules — do not do these unless explicitly instructed

- Do not modify `frontend-example/` — it is a read-only reference export
- Do not add backend, database, or auth code
- Do not add WebSocket or real-time collaboration infrastructure
- Do not create API routes (`app/api/`)
- Do not redesign the UI or rename CSS classes
- Do not install packages without explicit instruction
- Do not commit or create branches without explicit instruction

## Backend integration points

All backend integration is deferred to `apps/web/src/services/roadmap.service.ts`. Every function has a `// TODO(backend): HTTP <method> <endpoint>` comment. When a backend exists, replace the stub bodies with real `fetch()` calls. Do not move business logic out of the service layer.

The `localStorage` persistence in `lib/storage.ts` and the contexts should remain — they serve as optimistic local state even when a backend is present.

## CSS conventions

- CSS is in `src/styles/*.css`, imported in cascade order via `app/globals.css`
- Do not convert CSS to Tailwind utility classes
- Do not rename existing CSS classes
- Keep responsive rules at the bottom of the owning file, not in a separate file
- Design tokens (custom properties) live in `styles/tokens.css` only

## Coding conventions

- `'use client'` at top of any component using hooks, browser APIs, or event handlers
- Server components (no directive) for pure layout/static components
- Custom hooks live in `src/hooks/`, named `use*.ts`
- All localStorage access goes through `src/lib/storage.ts` — never call `localStorage` directly in components
- Context providers: `RoadmapContext` owns roadmap state + persistence; `ThemeContext` owns theme + persistence
- The service layer (`roadmap.service.ts`) is the only place that should reference HTTP endpoints

## Local-first behavior — preserve this

- `storage.ts` is SSR-safe (`typeof window` guard) and JSON-error-safe (try/catch)
- `RoadmapContext` hydrates from localStorage on mount, falls back to `SAMPLE_ROADMAP`
- `ThemeContext` reads from localStorage on mount, persists on change
- JSON export uses the Blob API + `<a>` download — no server needed
- JSON import uses `FileReader` + shape validation — no server needed

## Validation after changes

```bash
pnpm lint         # Must pass with no warnings
pnpm typecheck    # Must pass with 0 errors
pnpm build        # All 5 routes must build statically
```

Visual smoke test after CSS changes: homepage hero, workspace modals, theme toggle, join page, viewer mode.
