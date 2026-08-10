# RoadForge documentation map

RoadForge documentation is split by purpose so contributors can tell current product
truth from historical design reasoning and project planning.

## Source-of-truth order

When two sources disagree, use this order:

1. **Code and executable tests** — current behavior and validation.
2. **Current contract/reference docs** — maintained explanation of the implemented behavior.
3. **Operational runbooks** — procedures that must match the current runtime.
4. **Architecture/design records** — reasoning and implementation history; they may describe earlier states.
5. **Roadmaps/examples** — plans or sample data; never proof that a capability exists.

A roadmap task marked complete is not implementation evidence by itself. A historical design
record is not an API contract. A TypeScript interface is not sufficient proof that imported
JSON is accepted; the real parser and its tests own that boundary.

## Start here

| Need | Read |
| --- | --- |
| Understand RoadForge quickly | [`../README.md`](../README.md) |
| Make a contribution | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and [`contributor-guide.md`](contributor-guide.md) |
| Understand architecture | [`architecture/overview.md`](architecture/overview.md) |
| Understand canonical data ownership | [`architecture/source-of-truth-rules.md`](architecture/source-of-truth-rules.md) |
| Understand shared access | [`access-model.md`](access-model.md) |
| Understand the browser application | [`frontend-foundation.md`](frontend-foundation.md) |
| Understand API semantics | [`backend-api.md`](backend-api.md) |
| Run release QA | [`manual-qa.md`](manual-qa.md) |
| Self-host | [`self-hosting.md`](self-hosting.md) and [`../deploy/self-hosted/README.md`](../deploy/self-hosted/README.md) |
| Review public-deployment security | [`public-deployment-security.md`](public-deployment-security.md) |
| Review security policies | [`security/README.md`](security/README.md) |
| Review performance budgets | [`performance.md`](performance.md) |
| Use the MCP adapter | [`mcp.md`](mcp.md) |

## Current contract documents

These files are expected to describe the current implementation and must be updated when
their contract changes:

- `access-model.md`
- `backend-api.md`
- `frontend-foundation.md`
- `performance.md`
- `architecture/overview.md`
- `architecture/source-of-truth-rules.md`
- focused current architecture references explicitly marked as current

If current code changes one of these contracts, update the matching document in the same
pull request or explain why no documentation change is required.

## Operational documentation

Operational files must be copy/paste safe and should not preserve stale commands for
historical interest:

- `self-hosting.md`
- `public-deployment-security.md`
- `manual-qa.md`
- `backend-smoke-tests.md`
- `security/`
- `../deploy/self-hosted/README.md`

Operational truth should prefer one maintained command/constant over repeating values in
many files. For example, roadmap request-size limits are owned by application code and
verified by tests; prose should point at that contract rather than invent a second value.

## Architecture and design records

Files under `architecture/` may include both current architecture references and records
of how a subsystem was designed or migrated.

Every design/history record should begin with a status such as:

```text
Status: Accepted current decision
Status: Implemented design record
Status: Superseded — current reference: <path>
```

An implemented or superseded record may retain useful reasoning, alternatives, and rollout
history, but readers should not need to infer whether its future-tense implementation plan
still applies.

When an old plan becomes misleading, prefer a short durable record that points to the
current contract rather than continuously editing old implementation steps to look current.

## RoadForge's own roadmap

`docs/roadforge-roadmap.json` is a **project-planning snapshot used to dogfood RoadForge**.
It is not the application starter template, not a release manifest, and not proof that a
feature is implemented.

The actual bundled first-run template is implemented in:

```text
apps/web/src/data/roadforge-template.ts
```

and covered by its unit/browser tests.

GitHub issues, pull requests, commits, tests, and current code are authoritative for the
engineering state of RoadForge.

## Examples and generator material

Files under `examples/` and roadmap generator/template material are sample inputs. New
examples should:

- use the current preferred import schema identifier;
- contain no credentials or private URLs;
- stay intentionally small enough to understand;
- avoid presenting project-internal backlog data as a product tutorial.

Compatibility fixtures may deliberately use legacy schemas, but their names/tests should
make that purpose explicit.

## Documentation changes in pull requests

Before adding a new document, ask whether the information belongs in an existing current
contract, runbook, ADR/design record, or example. Avoid creating another broad "overview"
that restates the same contract.

A documentation PR should state:

- whether the file describes current behavior or historical reasoning;
- which code/test owns the underlying contract;
- whether commands were actually exercised when the document is operational;
- whether another document becomes obsolete because of the change.

## Documentation quality gate

The repository checks internal Markdown links and important product-copy contracts in CI.
Those automated checks prevent several classes of drift, but they do not prove that prose
matches implementation. Reviewers should still compare load-bearing claims with current
code/tests.
