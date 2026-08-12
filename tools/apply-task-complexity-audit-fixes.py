from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f'{path}: expected {count}, found {actual}: {old[:120]!r}')
    p.write_text(text.replace(old, new, count))


# API partial-write allowlists must actually carry complexity through.
replace(
    'apps/api/src/api/schemas/tasks.py',
    '        mutable_fields = {"title", "desc", "est", "assignees", "tags", "links"}',
    '        mutable_fields = {"title", "desc", "est", "complexity", "assignees", "tags", "links"}',
)
replace(
    'apps/api/src/api/services/roadmap_helpers.py',
    '_TASK_PATCH_FIELDS = ("title", "desc", "est", "assignees", "tags", "links")',
    '_TASK_PATCH_FIELDS = ("title", "desc", "est", "complexity", "assignees", "tags", "links")',
)

# Make the top-level editor prevent an invalid Very high selection rather than
# letting the user select it and only discovering the rule at save time.
replace(
    'apps/web/src/components/roadmap/TaskEditForm.tsx',
    "              disabled={isNested && option.value === 'very_high'}",
    "              disabled={option.value === 'very_high' && (isNested || directSubtaskCount < 2)}",
)
replace(
    'apps/web/src/components/roadmap/TaskEditForm.tsx',
    '        <small>{complexityOption.description}</small>\n        {missingBreakdown && (',
    "        <small>{complexityOption.description}</small>\n        {!isNested && directSubtaskCount < 2 && draft.complexity !== 'very_high' && (\n          <small>Very high unlocks after this task has at least two direct subtasks.</small>\n        )}\n        {missingBreakdown && (",
)

# Current API docs and implementation record must not enumerate the old field set.
replace(
    'docs/backend-api.md',
    'Focused writes modify the same canonical roadmap document as aggregate saves. They do\nnot create a second source of truth.\n',
    'Focused writes modify the same canonical roadmap document as aggregate saves. They do\nnot create a second source of truth. Task planning PATCH supports title, description, time\nestimate, complexity, assignees, tags, and supported links. `very_high` complexity is only\nvalid for top-level tasks with at least two direct subtasks; the domain validator rejects\nwrites that would violate that structure.\n',
)
replace(
    'docs/architecture/task-partial-write-api.md',
    "broad for changing one task's title, description, estimate, assignees, tags, or supported\nlinks.",
    "broad for changing one task's title, description, estimate, complexity, assignees, tags,\nor supported links.",
)

# API helper + endpoint coverage.
replace(
    'apps/api/tests/test_task_patch.py',
    '        ({"est": "5d"}, "est", "5d"),\n        ({"assignees":',
    '        ({"est": "5d"}, "est", "5d"),\n        ({"complexity": "high"}, "complexity", "high"),\n        ({"assignees":',
)
replace(
    'apps/api/tests/test_task_patch.py',
    '        est="3d",\n        desc="New description",',
    '        est="3d",\n        complexity="high",\n        desc="New description",',
)
replace(
    'apps/api/tests/test_task_patch.py',
    '    assert result.changed_fields == ["title", "desc", "est", "assignees", "tags"]',
    '    assert result.changed_fields == ["title", "desc", "est", "complexity", "assignees", "tags"]',
)
replace(
    'apps/api/tests/test_task_patch.py',
    '    assert task["est"] == "3d"\n    assert task["assignees"]',
    '    assert task["est"] == "3d"\n    assert task["complexity"] == "high"\n    assert task["assignees"]',
)
replace(
    'apps/api/tests/test_task_patch.py',
    '        "est",\n        "desc",',
    '        "est",\n        "complexity",\n        "desc",',
)
replace(
    'apps/api/tests/test_task_patch.py',
    '        {"est": "x" * 65},\n        {"assignees":',
    '        {"est": "x" * 65},\n        {"complexity": "impossible"},\n        {"assignees":',
)

# Compile-time and round-trip canaries for the new domain field.
replace(
    'apps/web/src/services/__tests__/roadmap-export-roundtrip.test.ts',
    '  id: true, title: true, done: true, next: true, est: true, assignees: true,',
    '  id: true, title: true, done: true, next: true, est: true, complexity: true, assignees: true,',
)
replace(
    'apps/web/src/services/__tests__/roadmap-export-roundtrip.test.ts',
    '    expect(roundTrippedSubtask.est).toBe(maximalSubtask.est)\n    expect(roundTrippedSubtask.assignees)',
    "    expect(roundTrippedSubtask.est).toBe(maximalSubtask.est)\n    expect(roundTrippedSubtask.complexity).toBe('medium')\n    expect(roundTrippedSubtask.assignees)",
)

replace(
    'apps/web/src/services/__tests__/roadmap-crud.service.test.ts',
    "      est: '3d',\n      assignees:",
    "      est: '3d',\n      complexity: 'high',\n      assignees:",
)
replace(
    'apps/web/src/services/__tests__/roadmap-crud.service.test.ts',
    "      est: maximalTask.est,\n      assignees:",
    "      est: maximalTask.est,\n      complexity: maximalTask.complexity,\n      assignees:",
)
replace(
    'apps/web/src/services/__tests__/roadmap-crud.service.test.ts',
    "        est: '2d',\n        assignees: ['Alex'],",
    "        est: '2d',\n        complexity: 'high',\n        assignees: ['Alex'],",
)
replace(
    'apps/web/src/services/__tests__/roadmap-crud.service.test.ts',
    "          est: '2d',\n          assignees: ['Alex'],",
    "          est: '2d',\n          complexity: 'high',\n          assignees: ['Alex'],",
)

# Portable format tests should make the default explicit.
replace(
    'apps/web/src/lib/__tests__/portable-roadmap.test.ts',
    "    expect(build).toMatchObject({\n      title: 'Build task',",
    "    expect(foundation.complexity).toBe('medium')\n    expect(build).toMatchObject({\n      title: 'Build task',\n      complexity: 'medium',",
)

# Edit draft coverage and required prop/accessibility coverage.
replace(
    'apps/web/src/lib/__tests__/task-edit.test.ts',
    "      est: '',\n      desc: '',",
    "      est: '',\n      complexity: 'medium',\n      desc: '',",
)
replace(
    'apps/web/src/lib/__tests__/task-edit.test.ts',
    "    ['estimate', { est: '3d' }],\n    ['description',",
    "    ['estimate', { est: '3d' }],\n    ['complexity', { complexity: 'high' as const }],\n    ['description',",
)
replace(
    'apps/web/src/components/__tests__/Accessibility.test.tsx',
    '          task={task}\n          isNested={false}\n          availableAssignees=',
    '          task={task}\n          isNested={false}\n          directSubtaskCount={0}\n          availableAssignees=',
)
replace(
    'apps/web/src/components/__tests__/Accessibility.test.tsx',
    '    // Check Estimate association\n    const estLabel',
    '    // Check Complexity association\n    const complexityLabel = container.querySelector(\'label[for="edit-complexity-t1"]\')\n    const complexityInput = container.querySelector(\'select[id="edit-complexity-t1"]\')\n    expect(complexityLabel).not.toBeNull()\n    expect(complexityInput).not.toBeNull()\n\n    // Check Estimate association\n    const estLabel',
)

# Markdown now exposes complexity deliberately.
replace(
    'apps/web/src/lib/__tests__/roadmap-markdown.test.ts',
    "    expect(output).toContain('- [x] `1.1` Completed dependency | tags:Planning')",
    "    expect(output).toContain('- [x] `1.1` Completed dependency | complexity:Medium; tags:Planning')",
)
replace(
    'apps/web/src/lib/__tests__/roadmap-markdown.test.ts',
    "    expect(output).toContain('est:2d')",
    "    expect(output).toContain('complexity:Medium')\n    expect(output).toContain('est:2d')",
)

# Browser mutation coverage: complexity-only changes are a real focused patch.
replace(
    'apps/web/src/lib/__tests__/task-mutations.test.ts',
    "  it('updates local links without changing unrelated task fields', async () => {",
    "  it('routes a synced complexity-only change through the focused patch path', async () => {\n    const params = createParams({\n      serverRoadmapId: 'rm_1',\n      sessionToken: 'session-token',\n      updatedAt: '2026-07-04T10:00:00Z',\n    })\n    const mutations = createTaskMutations(params)\n\n    await expect(mutations.handleUpdateTask('RF-303', { complexity: 'high' })).resolves.toBe(true)\n\n    expect(params.patchSyncedTask).toHaveBeenCalledWith({\n      task: phases[0].tasks[0],\n      updates: { complexity: 'high' },\n    })\n    expect(params.setPhases).not.toHaveBeenCalled()\n  })\n\n  it('rejects Very high until a top-level task has two direct subtasks', async () => {\n    const params = createParams()\n    const mutations = createTaskMutations(params)\n\n    await expect(mutations.handleUpdateTask('RF-303', { complexity: 'very_high' })).resolves.toBe(false)\n    expect(params.setPhases).not.toHaveBeenCalled()\n    expect(params.showToast).toHaveBeenCalledWith(expect.stringContaining('at least two direct subtasks'))\n  })\n\n  it('updates local links without changing unrelated task fields', async () => {",
)

# Remove this one-shot patcher and workflow from the final branch.
Path('.github/workflows/apply-task-complexity-audit-fixes.yml').unlink(missing_ok=True)
Path('tools/apply-task-complexity-audit-fixes.py').unlink(missing_ok=True)
