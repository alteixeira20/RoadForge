# Roadmap performance baseline

Run the reproducible local benchmark from the repository root:

```bash
corepack pnpm --dir apps/web benchmark:roadmap
```

Two narrower entry points exist for iteration:

```bash
corepack pnpm --dir apps/web benchmark:roadmap:cpu      # Node budgets only
corepack pnpm --dir apps/web benchmark:roadmap:browser  # production browser only
```

The command uses deterministic fixtures and one test file at a time. It reports
median CPU timings after a warm-up, runs the existing controlled tests for
typing/caret stability, render isolation, autosync, and realtime refresh state,
then measures hydration, typing, search, and phase expansion in a production
Chromium build. It does not contact PostgreSQL, Redis, or a deployed environment.

The browser stage builds the app and serves the same `output: 'standalone'`
artifact the Dockerfile ships, through `apps/web/scripts/serve-standalone.mjs`
on `127.0.0.1:4174` with one worker and no retries. `next start` is not used
because Next rejects it for standalone output. The script stages `.next/static`
and `public/` into the standalone tree exactly as the Dockerfile runner stage
does, so a passing browser benchmark also proves the deployable server boots.

## Representative fixtures

| Fixture | Phases | Tasks | Intended use |
| --- | ---: | ---: | --- |
| Small | 5 | 50 | Ordinary personal roadmap |
| Medium | 10 | 250 | Busy team roadmap |
| Large | 20 | 1,000 | Beta stress baseline below schema maxima |

Every fixture includes descriptions, tags, assignees, dependencies, estimates,
completion state, a next task, and credential-free links. The real import parser
validates each fixture before timing assertions.

## Shared-CI budgets

The budgets are intentionally practical rather than hardware-tuned:

| Metric, large fixture | Budget |
| --- | ---: |
| Parse, upgrade, and hydration preparation | 400 ms median |
| Search/filter computation | 100 ms median |
| Phase/task display-number preparation | 150 ms median |
| Import parser | 250 ms median |
| JSON export | 250 ms median |
| Markdown export | 200 ms median |
| Cache serialize/parse round trip | 150 ms median |
| Autosync request body | 384 KiB |
| Production hydration to usable workspace | 2,500 ms |
| Controlled middle-string keystroke and caret | 500 ms |
| Broad 1,000-task search stabilization | 2,000 ms |
| Expand one 50-task phase | 750 ms |

## Recorded baseline

Measured on 2026-07-25 with the large 1,000-task fixture on a Linux developer
workstation. Treat these as one machine's numbers, not a portable target; the
budgets above are the gate.

| Metric | Result | Budget |
| --- | ---: | ---: |
| Autosync request body | 297.0 KiB | 384 KiB |
| Parse, upgrade, hydration preparation | 27.5 ms | 400 ms |
| Cache serialize/parse round trip | 2.0 ms | 150 ms |
| Search/filter computation | 1.5 ms | 100 ms |
| Display-number preparation | 0.5 ms | 150 ms |
| Import parser | 2.9 ms | 250 ms |
| JSON export | 9.3 ms | 250 ms |
| Markdown export | 8.8 ms | 200 ms |
| Production hydration to usable | 628.6 ms | 2,500 ms |
| Controlled keystroke and caret | 80.8 ms | 500 ms |
| Broad 1,000-task search stabilization | 1,764.1 ms | 2,000 ms |
| Expand one 50-task phase | 435.1 ms | 750 ms |

Browser timings vary widely between runs on the same machine, so a single run is
not a baseline. Across five consecutive runs, hydration measured 629–947 ms,
keystroke/caret 48–185 ms, search stabilization 1,350–1,764 ms, and phase
expansion 262–435 ms.

Broad search has far less headroom than any other metric: its worst observed run
sat about 12% below budget, while every other metric stayed several times
clear. Treat a search regression as the first signal worth investigating, and
expect this to be the metric that fails first on slower hardware. It is
deliberately not exempted or given a looser budget — a gate that only just
passes is the useful early warning here.

## Known boundaries

The API request-body ceiling is 512 KiB while local import permits up to 5 MiB.
The 384 KiB payload budget leaves headroom for activity metadata and transport
variation; passing local import does not guarantee that a roadmap can be synced.

Browser paint, Safari/Firefox behavior, private-mode storage quotas, real
PostgreSQL/Redis latency, reverse-proxy limits, and cross-worker SSE propagation
remain deployment/manual evidence. Optimize only a reproducible failed metric;
do not add virtualization, incremental sync, or replacement state
infrastructure speculatively.
