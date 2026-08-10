# Roadmap performance baseline

RoadForge keeps a reproducible large-roadmap benchmark so performance regressions are
measured before speculative architecture is introduced.

Run the complete benchmark from the repository root:

```bash
corepack pnpm --dir apps/web benchmark:roadmap
```

Focused entry points:

```bash
corepack pnpm --dir apps/web benchmark:roadmap:cpu
corepack pnpm --dir apps/web benchmark:roadmap:browser
```

The benchmark uses deterministic fixtures and the real RoadForge import/parser path.
The production-browser stage builds and serves the same Next.js standalone artifact
used by the production web container.

## Fixtures

| Fixture | Phases | Tasks | Purpose |
| --- | ---: | ---: | --- |
| Small | 5 | 50 | ordinary personal roadmap |
| Medium | 10 | 250 | busy team roadmap |
| Large | 20 | 1,000 | stress baseline below schema maxima |

Fixtures include descriptions, tags, assignees, dependencies, estimates, completion
state, a next task, and credential-free links.

## Shared-CI budgets

| Large-fixture metric | Budget |
| --- | ---: |
| Parse, upgrade, hydration preparation | 400 ms median |
| Search/filter computation | 100 ms median |
| Phase/task display-number preparation | 150 ms median |
| Import parser | 250 ms median |
| JSON export | 250 ms median |
| Markdown export | 200 ms median |
| Cache serialize/parse round trip | 150 ms median |
| Autosync request body | 384 KiB performance budget |
| Production hydration to usable workspace | 2,500 ms |
| Controlled middle-string keystroke/caret | 500 ms |
| Broad 1,000-task search stabilization | 2,000 ms |
| Expand one 50-task phase | 750 ms |

The **384 KiB autosync value is a performance regression budget, not the API request
limit**. The supported browser/API/nginx roadmap payload ceiling is **5 MiB**, defined
by `REQUEST_BODY_MAX_BYTES` in `apps/api/src/api/schemas/limits.py`.

## Recorded development baseline

A Linux developer-workstation run recorded on 2026-07-25 produced:

| Metric | Result |
| --- | ---: |
| Autosync request body | 297.0 KiB |
| Parse/upgrade/hydration preparation | 27.5 ms |
| Cache serialize/parse round trip | 2.0 ms |
| Search/filter computation | 1.5 ms |
| Display-number preparation | 0.5 ms |
| Import parser | 2.9 ms |
| JSON export | 9.3 ms |
| Markdown export | 8.8 ms |
| Production hydration to usable | 628.6 ms |
| Controlled keystroke/caret | 80.8 ms |
| Broad search stabilization | 1,764.1 ms |
| Expand one 50-task phase | 435.1 ms |

These numbers are historical evidence from one machine, not portable targets. The
budgets above are the contract. Browser timings vary significantly with CPU load and
runner performance.

Broad search had the least headroom in the recorded runs and should be treated as the
first likely regression signal.

## What this benchmark proves

It can detect regressions in:

- roadmap parsing/upgrade preparation;
- browser cache serialization;
- filtering/search computation;
- JSON and Markdown export;
- controlled editor interactions;
- production hydration and phase expansion;
- accidental autosync payload growth.

## What it does not prove

The local benchmark does not certify:

- Safari or Firefox behavior;
- private-mode/browser-storage quotas;
- real PostgreSQL or Redis latency;
- proxy/tunnel latency;
- multi-worker event propagation;
- real mobile hardware;
- production backup/recovery performance.

Those remain browser/deployment evidence.

## Optimization rule

Do not add virtualization, replacement state infrastructure, CRDTs, or new partial
write systems merely because they might be faster. Optimize only a measured failed or
meaningfully regressed metric, and preserve RoadForge's canonical snapshot/import
contracts while doing so.
