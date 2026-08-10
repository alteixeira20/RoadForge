## What problem does this solve?

<!-- Describe the user-visible bug, usability problem, maintenance need, or accepted issue. -->

## What changed?

<!-- Keep this focused. Mention the main implementation areas, not every edited file. -->

## Contract impact

Check every area this PR changes and explain it below when applicable:

- [ ] Portable roadmap/import-export format
- [ ] Browser persistence/local-first behavior
- [ ] API request/response behavior
- [ ] Authorization/session/sharing behavior
- [ ] Database schema or persisted server data
- [ ] Realtime/locks/claims/concurrency
- [ ] Deployment/configuration/operations
- [ ] User-visible UI/accessibility
- [ ] No contract impact

**Notes:**

<!-- Name migrations, environment variables, compatibility behavior, or source-of-truth changes. -->

## Validation

<!-- Paste the exact commands/checks you ran and the result. Do not write "tests pass" without naming them. -->

```text
<command> -> PASS / FAIL / NOT RUN
```

Manual QA performed:

<!-- Describe the browser/role/scenario when behavior changed. Write "Not applicable" if genuinely not needed. -->

## Risk and recovery

<!-- What can fail? Could existing roadmaps/data be affected? How would we recover or roll back? -->

## Screenshots

<!-- UI changes only. Otherwise write "Not applicable." Never include private roadmap data or credentials. -->

## Final checklist

- [ ] The PR solves one coherent outcome and avoids unrelated cleanup.
- [ ] Focused regression tests were added/updated, or I explained why none are needed.
- [ ] Applicable local checks were run, and anything not run is explicitly listed.
- [ ] Current documentation changed with any user/API/data/operational contract change.
- [ ] Supported historical roadmap imports remain compatible, or an explicit upgrade path is included.
- [ ] No participant token, invite link, password, private roadmap, production data, or secret is committed or shown in evidence.
- [ ] Persisted-data changes include a reviewed migration and recovery/rollback notes, or are not applicable.
- [ ] Security-sensitive changes include negative authorization/failure-path coverage, or are not applicable.
- [ ] Source-of-truth boundaries remain intact: portable roadmap data is credential-free and derivative state is not made canonical accidentally.
