# RoadForge governance

RoadForge is maintained as an Anvilary project with lightweight, transparent governance.
The goal is to make contribution expectations predictable without adding process that a
small project cannot actually sustain.

## Maintainer responsibilities

Maintainers are responsible for:

- protecting the local-first/accountless product contract;
- reviewing changes for correctness, security, compatibility, and recovery;
- keeping the main development branch buildable and release gates meaningful;
- triaging public issues without exposing contributor or user private data;
- documenting material architecture/product decisions;
- cutting releases only from a frozen, verified candidate;
- making it clear when a proposed change is accepted, deferred, or out of scope.

## How decisions are made

Small bug fixes, tests, documentation corrections, and implementation details can be
settled in pull-request review.

Open an issue/design discussion before changes that materially affect:

- product scope or a new visible feature concept;
- portable roadmap formats/compatibility;
- account/access/authorization semantics;
- canonical server persistence;
- deployment/realtime architecture;
- licensing or contribution terms.

The maintainer records the decision and its rationale in the issue/PR or an architecture
decision record when the reasoning needs to survive beyond the implementation.

## Pull requests

A pull request is merged when:

- its outcome is accepted;
- review concerns are resolved;
- required CI is green on the current head;
- relevant manual/operational checks are complete or explicitly deferred for a valid reason;
- compatibility/security/data risks are understood;
- the branch has not moved after the evidence being relied upon.

Green CI is necessary evidence, not automatic approval.

## Contribution credit

Contributions remain attributed through Git history and GitHub. Maintainers should avoid
squashing away meaningful co-author attribution when the chosen merge method would lose
it without replacement attribution.

## Releases

RoadForge follows Semantic Versioning after the `0.1.0` baseline. Release candidates are
frozen and validated according to `.github/RELEASE_CHECKLIST.md`.

Release notes must state known limitations rather than hiding them. The hosted Anvilary
instance should be described accurately as a demo/convenience deployment unless its
service guarantees are deliberately changed in the future.

## Security reports

Vulnerabilities use the private process in `SECURITY.md`. Public issues that accidentally
contain active credentials should be treated as an incident: minimize further exposure,
rotate/revoke affected credentials, and move security discussion to the private channel.

## Conduct

Participation is governed by `CODE_OF_CONDUCT.md`. Technical disagreement is expected;
reviews should address observable behavior, risks, and tradeoffs rather than contributors.

## Licensing

The repository currently uses PolyForm Noncommercial 1.0.0. That is a source-available,
non-OSI license. Any move to an OSI-approved open-source license is a maintainer/legal
copyright decision and must be performed deliberately; contribution acceptance does not
silently change the license.

## Changes to governance

Governance changes should be proposed in a dedicated pull request so contributors can see
when process expectations change. Keep this file short enough to match how the project is
actually maintained.
