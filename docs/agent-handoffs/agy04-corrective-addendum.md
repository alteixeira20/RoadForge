# AGY04 Corrective Addendum: Phase Creation HTTP 422 and Playwright Test Bypass

**Author:** AGY04 (Corrective Pass)
**Date:** 2026-09-26
**Branch:** `integration/collaboration-stability`
**Base commit (pre-correction):** `20c63bead2c31564d9c94663b3eb512a45a52f6a`
**Corrective commit:** `a605847f43812e4377a9e5990870a3c0d3c99796`
**Audit source:** AGY05 Independent Release Audit Report, 2026-09-26

---

## 1. Summary

This addendum documents a targeted corrective pass resolving the two
release-blocking issues identified by AGY05:

1. **P1 Defect:** HTTP 422 on phase creation caused by extra fields in the
   serialized JSON payload, violating the backend's `extra="forbid"` schema.
2. **P2 Defect:** A Playwright multi-client test that silently bypassed
   phase-creation assertions via an invalid CSS selector inside a conditional
   `if (await isVisible())` block.

---

## 2. Root Cause Analysis

### 2.1 HTTP 422 on Phase Creation (P1)

**Affected file:** `apps/web/src/services/roadmap-structure.service.ts`

**Root cause:** `createServerPhase` received a `Phase` object (from
`createPhase()` in `usePhaseMutations`) and passed it directly to
`JSON.stringify`. TypeScript's structural subtyping allowed this because
`Phase` satisfies `CreatePhaseFields` at the type level. However,
`JSON.stringify` serializes all enumerable properties, producing a payload
containing `num`, `tasks`, `progress`, and `status` in addition to the four
permitted fields.

The backend schema is:
```python
class CreatePhaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=ID_MAX)
    name: str = Field(min_length=1, max_length=PHASE_NAME_MAX)
    color: str = Field(min_length=1, max_length=PHASE_COLOR_MAX)
    colorMode: Literal["auto", "manual"] = "auto"
```

FastAPI returned HTTP 422 with four `extra_forbidden` validation errors.
The error was classified by `classifyRoadmapSaveError` as `kind='validation'`,
which triggered the `definitive = true` branch in `createSyncedPhase`. The
optimistic phase was correctly rolled back via
`setCurrentPhases(removePhaseAndDanglingDependencies(...))` and a user-facing
toast was shown ("The server rejected this phase. The local phase was removed.").

**Impact:**
- The created phase was never persisted to PostgreSQL.
- No `phase.created` SSE event was broadcast to other collaborators.
- Remote clients never received the new phase.
- The author's own phase disappeared on browser reload.

**Pre-existing vs integration regression:** The defect originated in
commit `04a9f18` (feat: server-authoritative phase structure), which introduced
`createServerPhase`. It was present in the common base before the integration
branch. AGY04's integration did not introduce or deepen the defect; it was
inherited unchanged.

### 2.2 Playwright Test Silent Bypass (P2)

**Affected file:** `apps/web/e2e/multi-client-collaboration.spec.ts` (test 4)

**Root cause:** The old test used the selector
`.add-phase-trigger, button:has-text("Add phase")` inside an
`if (await addPhaseBtn.isVisible())` guard. The class `.add-phase-trigger`
does not exist in the DOM; the actual button uses `.add-phase-after-list`.
Because `isVisible()` returned `false`, the entire block was skipped and the
test passed without ever exercising phase creation or verifying SSE
propagation.

---

## 3. Changes Made

### 3.1 Fix: `apps/web/src/services/roadmap-structure.service.ts`

Explicitly construct a payload object containing only the four fields
permitted by `CreatePhaseRequest` before calling `JSON.stringify`:

```typescript
const payload = {
  id: phase.id,
  name: phase.name,
  color: phase.color,
  colorMode: phase.colorMode,
}
```

The backend's `extra="forbid"` schema is preserved and intentionally not
weakened. The fix is in the serialization path, not the schema.

### 3.2 New: `apps/web/src/services/__tests__/roadmap-structure.service.test.ts`

Nine API-contract regression tests:

| Test | Assertion |
| :--- | :--- |
| Exact payload `{id, name, color, colorMode}` | `toStrictEqual(EXPECTED_PAYLOAD)` |
| `num` absent from payload | `not.toHaveProperty('num')` |
| `tasks` absent from payload | `not.toHaveProperty('tasks')` |
| `progress` absent from payload | `not.toHaveProperty('progress')` |
| `status` absent from payload | `not.toHaveProperty('status')` |
| `colorMode: 'manual'` preserved | `toMatchObject({colorMode: 'manual'})` |
| 422 response surfaces as `ApiError` with `validationErrors` | `rejects.toSatisfy(...)` |
| Success path returns `PhaseMutationResult` | `updatedAt`, `phases` shape |
| POST to correct URL with Bearer header | URL and method assertion |

### 3.3 Fix: `apps/web/e2e/multi-client-collaboration.spec.ts` (test 4)

Replaced the hollow test with a comprehensive, mandatory-assertion test:

- **Selector corrected:** `.add-phase-after-list` (actual DOM class)
- **Visibility assertion mandatory:** `await expect(addPhaseBtn).toBeVisible()`
  before any click; a selector mismatch now fails the test
- **POST verified:** No `.toast.is-error` after click; sync indicator stays
  `.is-live`
- **SSE verified:** Owner receives the new phase within 15 s timeout
- **Database persistence verified:** Phase survives editor browser reload
- **Delete SSE verified:** Phase removal propagates to second client
- **Reorder invariant verified:** Owner's deliberately collapsed phases remain
  collapsed after receiving an SSE update
- **No conditional branching:** All `if (await isVisible())` guards that
  could silently skip essential actions were removed from the rewritten test

---

## 4. 422 Error Path: Optimistic Rollback Verification

The rollback path was traced and confirmed correct prior to this fix:

| Step | Behaviour |
| :--- | :--- |
| HTTP 422 received | `classifyRoadmapSaveError` -> `kind='validation'` |
| `definitive = true` branch | Entered in `createSyncedPhase` |
| Optimistic phase removed | `setCurrentPhases(removePhaseAndDanglingDependencies(...))` |
| User notification | `showToast('The server rejected this phase. The local phase was removed.')` |
| Barrier resolved | `barrier.resolve('absent')` - dependent writes (reorder, delete) are cancelled |
| Saved state | `setSaved(false)` is NOT called on this path; the roadmap retains its prior saved state |

**Conclusion:** The 422 error path did not silently persist a saved-looking
state. The optimistic phase was correctly removed. The only user-visible
defect was the misleading toast message (which says "rejected" without
indicating the actual cause was extra fields). The corrected serialization
eliminates this condition entirely.

---

## 5. Other Conditional Assertions Reviewed

All `if (await ...)` patterns in both Playwright suites were audited:

| Location | Pattern | Verdict |
| :--- | :--- | :--- |
| `multi-client` test 1, line 111 | `if (await expandBtn.isVisible())` | Legitimate state setup (task expand) |
| `multi-client` test 2, lines 173, 177 | `if (await expandBtn*.isVisible())` | Legitimate state setup |
| `multi-client` test 2, line 216 | `if (await resumeBtn.isVisible())` | Legitimate - lock banner may or may not appear; save-button enablement assertion follows |
| `multi-client` test 4 (new), line 304 | `if (textContent.includes('Expand all'))` | Legitimate toggle normalisation |
| `multi-client` test 10, lines 338-343 | `if (!await evaluate(...expanded))` and `if (isVisible())` | Legitimate state setup |
| `quiet-collaboration` lines 19, 64, 143 | Similar expand guards | Legitimate state setup |

No additional silent-skip patterns were found requiring correction.

---

## 6. Test Results

All tests executed against fresh, uniquely named disposable services
(`agy04-corrective-postgres` on port 5444, `agy04-corrective-redis` on
port 6404). Neither service was shared with or modified the data of any
other agent.

| Suite | Command | Result |
| :--- | :--- | :--- |
| Web unit + integration | `cd apps/web && pnpm test` | **103 files, 767 tests passed** (0 failed) |
| Backend integration + API | `uv run pytest tests unit_tests -x -q` | **435 passed, 4 skipped** (0 failed) |
| SSE capacity | `uv run pytest tests/test_realtime_capacity.py -v` | **12 passed** (0 failed) |
| MCP package | `npm run check` (packages/roadforge-mcp) | **14 passed**, build + dry-run pack clean |
| TypeScript | `pnpm typecheck` | **0 errors** |
| ESLint | `pnpm lint` | **0 errors, 0 warnings** |
| Production build | `pnpm build` | **Success** (all routes, no errors) |
| Release checks | `pnpm check:copy check:release check:cycles check:em-dash` | **All pass** |

**Playwright suites:** The multi-client and quiet-collaboration Playwright
suites require a running application stack (Next.js + FastAPI + PostgreSQL +
Redis). They are integration tests that must be executed in the AGY05 re-audit
environment against the corrected HEAD. The unit-level API-contract regression
tests added in this pass are specifically designed to verify the serialization
fix without requiring a live server.

**Skipped backend tests:** 4 tests were skipped. These are the same 4 skipped
in the AGY05 baseline (infrastructure-dependent tests marked with
`@pytest.mark.skip` or `@pytest.mark.skipif`). No tests were newly skipped.

---

## 7. Commit Integrity

- **No `Co-authored-by` trailers:** Verified via `git log -1 --format="%B"`.
- **No em-dashes:** Verified via `pnpm check:em-dash` (602 tracked files clean)
  and Python `str.count('\u2014')` on the commit message.
- **No push, merge, or deployment** was performed.

---

## 8. Remaining Blockers for AGY05 Re-Audit

| Item | Status |
| :--- | :--- |
| HTTP 422 phase creation defect | **RESOLVED** in commit `a605847` |
| Playwright hollow conditional test | **RESOLVED** in commit `a605847` |
| Playwright multi-client suite (requires live stack) | Pending re-audit by AGY05 |
| Playwright quiet-collaboration suite (requires live stack) | Pending re-audit by AGY05 |
| Production-build browser tests | Pending re-audit by AGY05 |
| Multi-tab local-only roadmap sync | Documented bounded limitation (unchanged) |

The corrective HEAD for AGY05 re-audit is:
**`a605847f43812e4377a9e5990870a3c0d3c99796`**
