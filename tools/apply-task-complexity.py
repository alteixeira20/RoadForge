from pathlib import Path
import re


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(
            f"{path}: expected {count} occurrence(s), found {actual}: {old[:120]!r}"
        )
    p.write_text(text.replace(old, new, count))


def replace_regex(path: str, pattern: str, repl: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    next_text, actual = re.subn(pattern, repl, text, count=count, flags=re.MULTILINE)
    if actual != count:
        raise SystemExit(
            f"{path}: expected {count} regex occurrence(s), found {actual}: {pattern[:120]!r}"
        )
    p.write_text(next_text)


# ---------------------------------------------------------------------------
# Domain model and shared complexity helpers
# ---------------------------------------------------------------------------
replace(
    "apps/web/src/types/roadmap.ts",
    "export type TaskClaimFilter = 'all' | 'mine' | 'claimed' | 'unclaimed'\nexport type TaskExternalLinkProvider = 'github' | 'url'",
    "export type TaskClaimFilter = 'all' | 'mine' | 'claimed' | 'unclaimed'\nexport type TaskComplexity = 'very_low' | 'low' | 'medium' | 'high' | 'very_high'\nexport type TaskExternalLinkProvider = 'github' | 'url'",
)
replace(
    "apps/web/src/types/roadmap.ts",
    "  est?: string\n  assignees?: string[]",
    "  est?: string\n  complexity?: TaskComplexity\n  assignees?: string[]",
)
replace(
    "apps/web/src/types/roadmap.ts",
    "  | 'est'\n  | 'assignees'",
    "  | 'est'\n  | 'complexity'\n  | 'assignees'",
)

Path("apps/web/src/lib/task-complexity.ts").write_text(
    """import type { Task, TaskComplexity } from '@/types/roadmap'\n\nexport interface TaskComplexityOption {\n  value: TaskComplexity\n  label: string\n  rank: number\n  description: string\n}\n\nexport const TASK_COMPLEXITY_LEVELS: readonly TaskComplexityOption[] = [\n  { value: 'very_low', label: 'Very low', rank: 1, description: 'Routine work with minimal uncertainty or coordination.' },\n  { value: 'low', label: 'Low', rank: 2, description: 'Straightforward work with few moving parts.' },\n  { value: 'medium', label: 'Medium', rank: 3, description: 'Normal task complexity with some coordination or uncertainty.' },\n  { value: 'high', label: 'High', rank: 4, description: 'Several moving parts, dependencies, or meaningful uncertainty.' },\n  { value: 'very_high', label: 'Very high', rank: 5, description: 'Too broad to execute safely as one task; it must be decomposed.' },\n] as const\n\nexport const DEFAULT_TASK_COMPLEXITY: TaskComplexity = 'medium'\n\nconst COMPLEXITY_VALUES = new Set<TaskComplexity>(\n  TASK_COMPLEXITY_LEVELS.map((option) => option.value),\n)\n\nexport function isTaskComplexity(value: unknown): value is TaskComplexity {\n  return typeof value === 'string' && COMPLEXITY_VALUES.has(value as TaskComplexity)\n}\n\nexport function getTaskComplexity(task: Pick<Task, 'complexity'>): TaskComplexity {\n  return isTaskComplexity(task.complexity) ? task.complexity : DEFAULT_TASK_COMPLEXITY\n}\n\nexport function getTaskComplexityOption(value: TaskComplexity): TaskComplexityOption {\n  return TASK_COMPLEXITY_LEVELS.find((option) => option.value === value)\n    ?? TASK_COMPLEXITY_LEVELS[2]\n}\n\nexport function getTaskComplexityLabel(task: Pick<Task, 'complexity'>): string {\n  return getTaskComplexityOption(getTaskComplexity(task)).label\n}\n\nexport function getTaskComplexityStructureIssue(\n  task: Task,\n  allTasks: Task[],\n): string | null {\n  if (getTaskComplexity(task) !== 'very_high') return null\n  if (task.parentId) {\n    return 'Very high complexity is only valid for top-level tasks. Break the parent work down instead.'\n  }\n  const directSubtasks = allTasks.filter((candidate) => candidate.parentId === task.id)\n  if (directSubtasks.length < 2) {\n    return 'Very high complexity tasks require at least two direct subtasks.'\n  }\n  return null\n}\n"""
)

# ---------------------------------------------------------------------------
# Task editor and visible metadata
# ---------------------------------------------------------------------------
replace(
    "apps/web/src/lib/task-edit.ts",
    "import type { Task } from '@/types/roadmap'",
    "import { getTaskComplexity } from '@/lib/task-complexity'\nimport type { Task, TaskComplexity } from '@/types/roadmap'",
)
replace(
    "apps/web/src/lib/task-edit.ts",
    "  est: string\n  desc: string",
    "  est: string\n  complexity: TaskComplexity\n  desc: string",
)
replace(
    "apps/web/src/lib/task-edit.ts",
    "    est: task.est ?? '',\n    desc: task.desc ?? '',",
    "    est: task.est ?? '',\n    complexity: getTaskComplexity(task),\n    desc: task.desc ?? '',",
)
replace(
    "apps/web/src/lib/task-edit.ts",
    "    || draft.est !== initial.est\n    || draft.desc !== initial.desc",
    "    || draft.est !== initial.est\n    || draft.complexity !== initial.complexity\n    || draft.desc !== initial.desc",
)

replace(
    "apps/web/src/components/roadmap/TaskEditForm.tsx",
    "import type { Task, TagDefinition } from '@/types/roadmap'",
    "import { TASK_COMPLEXITY_LEVELS, getTaskComplexityOption } from '@/lib/task-complexity'\nimport type { Task, TaskComplexity, TagDefinition } from '@/types/roadmap'",
)
replace(
    "apps/web/src/components/roadmap/TaskEditForm.tsx",
    "  task: Task\n  isNested: boolean\n  availableAssignees: string[]",
    "  task: Task\n  isNested: boolean\n  directSubtaskCount: number\n  availableAssignees: string[]",
)
replace(
    "apps/web/src/components/roadmap/TaskEditForm.tsx",
    "  task,\n  isNested,\n  availableAssignees,",
    "  task,\n  isNested,\n  directSubtaskCount,\n  availableAssignees,",
)
replace(
    "apps/web/src/components/roadmap/TaskEditForm.tsx",
    "  const isDirty = isTaskEditDraftDirty(draft, task)\n",
    "  const isDirty = isTaskEditDraftDirty(draft, task)\n  const complexityOption = getTaskComplexityOption(draft.complexity)\n  const invalidNestedComplexity = isNested && draft.complexity === 'very_high'\n  const missingBreakdown = !isNested\n    && draft.complexity === 'very_high'\n    && directSubtaskCount < 2\n  const complexityInvalid = invalidNestedComplexity || missingBreakdown\n",
)
replace(
    "apps/web/src/components/roadmap/TaskEditForm.tsx",
    "    if (!canCommit || !draft.title.trim()) return",
    "    if (!canCommit || !draft.title.trim() || complexityInvalid) return",
)
replace(
    "apps/web/src/components/roadmap/TaskEditForm.tsx",
    "      est: draft.est,\n      desc: draft.desc,",
    "      est: draft.est,\n      complexity: draft.complexity,\n      desc: draft.desc,",
)
replace(
    "apps/web/src/components/roadmap/TaskEditForm.tsx",
    "      </div>\n      {!isNested && (\n        <div className=\"field\">\n          <label htmlFor={`edit-est-${task.id}`}>Estimate</label>",
    "      </div>\n      <div className=\"field\">\n        <label htmlFor={`edit-complexity-${task.id}`}>Complexity</label>\n        <select\n          id={`edit-complexity-${task.id}`}\n          value={draft.complexity}\n          onChange={(e) => setDraft({ ...draft, complexity: e.target.value as TaskComplexity })}\n        >\n          {TASK_COMPLEXITY_LEVELS.map((option) => (\n            <option\n              key={option.value}\n              value={option.value}\n              disabled={isNested && option.value === 'very_high'}\n            >\n              {option.label}\n            </option>\n          ))}\n        </select>\n        <small>{complexityOption.description}</small>\n        {missingBreakdown && (\n          <small role=\"alert\">Very high complexity requires at least two direct subtasks.</small>\n        )}\n        {invalidNestedComplexity && (\n          <small role=\"alert\">Nested tasks cannot be Very high because RoadForge supports one subtask level.</small>\n        )}\n      </div>\n      {!isNested && (\n        <div className=\"field\">\n          <label htmlFor={`edit-est-${task.id}`}>Time estimate (optional)</label>",
)
replace(
    "apps/web/src/components/roadmap/TaskEditForm.tsx",
    "            placeholder=\"e.g. 2d, 5h…\"\n          />\n        </div>",
    "            placeholder=\"e.g. 2d, 5h…\"\n          />\n          <small>Heuristic only — complexity is the primary planning signal.</small>\n        </div>",
)
replace(
    "apps/web/src/components/roadmap/TaskEditForm.tsx",
    "          disabled={!draft.title.trim() || !canCommit}",
    "          disabled={!draft.title.trim() || !canCommit || complexityInvalid}",
)

replace(
    "apps/web/src/components/roadmap/TaskDetailMeta.tsx",
    "import { resolveTagDisplay } from '@/lib/tag-registry'",
    "import { resolveTagDisplay } from '@/lib/tag-registry'\nimport { getTaskComplexityLabel } from '@/lib/task-complexity'",
)
replace(
    "apps/web/src/components/roadmap/TaskDetailMeta.tsx",
    "    <dl className=\"task-meta-stack\">\n      {!isNested && (",
    "    <dl className=\"task-meta-stack\">\n      <div className=\"task-meta-group is-complexity\">\n        <dt className=\"task-meta-label\">Complexity</dt>\n        <dd className=\"task-meta-value\">\n          <span className=\"meta-pill complexity-pill\">{getTaskComplexityLabel(task)}</span>\n        </dd>\n      </div>\n      {!isNested && (",
)
replace(
    "apps/web/src/components/roadmap/TaskDetailMeta.tsx",
    "          <dt className=\"task-meta-label\">Estimate</dt>",
    "          <dt className=\"task-meta-label\">Time estimate · heuristic</dt>",
)

replace(
    "apps/web/src/components/roadmap/task-row/TaskRowHeader.tsx",
    "import type { TagDefinition, Task } from '@/types/roadmap'",
    "import { getTaskComplexityLabel } from '@/lib/task-complexity'\nimport type { TagDefinition, Task } from '@/types/roadmap'",
)
replace(
    "apps/web/src/components/roadmap/task-row/TaskRowHeader.tsx",
    "      {lockedByOther && (",
    "      <span className=\"meta-pill complexity-pill\" title=\"Task complexity\">\n        {getTaskComplexityLabel(task)}\n      </span>\n      {lockedByOther && (",
)
replace(
    "apps/web/src/components/roadmap/TaskRow.tsx",
    "              task={task}\n              isNested={isNested}\n              availableAssignees={availableAssignees}",
    "              task={task}\n              isNested={isNested}\n              directSubtaskCount={subtasks.length}\n              availableAssignees={availableAssignees}",
)

# ---------------------------------------------------------------------------
# Client mutation and completion invariants
# ---------------------------------------------------------------------------
replace(
    "apps/web/src/hooks/useTaskMutations.ts",
    "import { getTaskCompletionBlocker } from '@/lib/task-completion'",
    "import { getTaskCompletionBlocker } from '@/lib/task-completion'\nimport { getTaskComplexity, getTaskComplexityStructureIssue } from '@/lib/task-complexity'",
)
replace(
    "apps/web/src/hooks/useTaskMutations.ts",
    "      next: false,\n      tags: ['subtask'],",
    "      next: false,\n      complexity: 'medium',\n      tags: ['subtask'],",
)
replace(
    "apps/web/src/hooks/useTaskMutations.ts",
    "      est: '',\n      tags: [],",
    "      est: '',\n      complexity: 'medium',\n      tags: [],",
)
replace(
    "apps/web/src/hooks/useTaskMutations.ts",
    "    const subtask = allTasks.find((t) => t.id === subtaskId)\n    if (!subtask?.parentId) return\n    setPhases(",
    "    const subtask = allTasks.find((t) => t.id === subtaskId)\n    if (!subtask?.parentId) return\n    const parent = allTasks.find((t) => t.id === subtask.parentId)\n    const siblingCount = allTasks.filter((t) => t.parentId === subtask.parentId).length\n    if (parent && getTaskComplexity(parent) === 'very_high' && siblingCount <= 2) {\n      showToast('Very high complexity tasks require at least two direct subtasks. Lower complexity before removing this subtask.')\n      return\n    }\n    setPhases(",
)
replace(
    "apps/web/src/hooks/useTaskMutations.ts",
    "    const task = allTasks.find((t) => t.id === id)\n    if (!task) return false\n    const changedFields = getChangedTaskFields(task, updates)",
    "    const task = allTasks.find((t) => t.id === id)\n    if (!task) return false\n    const complexityIssue = getTaskComplexityStructureIssue({ ...task, ...updates }, allTasks)\n    if (complexityIssue) {\n      showToast(complexityIssue)\n      return false\n    }\n    const changedFields = getChangedTaskFields(task, updates)",
)

replace(
    "apps/web/src/lib/task-completion.ts",
    "import type { Task } from '@/types/roadmap'",
    "import { getTaskComplexityStructureIssue } from '@/lib/task-complexity'\nimport type { Task } from '@/types/roadmap'",
)
replace(
    "apps/web/src/lib/task-completion.ts",
    "export function getTaskCompletionBlocker(task: Task, allTasks: Task[]): string | null {\n  const subtasks",
    "export function getTaskCompletionBlocker(task: Task, allTasks: Task[]): string | null {\n  const complexityIssue = getTaskComplexityStructureIssue(task, allTasks)\n  if (complexityIssue) return complexityIssue\n\n  const subtasks",
)

# ---------------------------------------------------------------------------
# Portable data, import compatibility, and roadmap hydration
# ---------------------------------------------------------------------------
replace(
    "apps/web/src/lib/portable-roadmap.ts",
    "import { computeTaskDisplayNumbers } from '@/lib/task-display'\nimport type { Phase, TaskExternalLink } from '@/types/roadmap'",
    "import { computeTaskDisplayNumbers } from '@/lib/task-display'\nimport { getTaskComplexity } from '@/lib/task-complexity'\nimport type { Phase, TaskComplexity, TaskExternalLink } from '@/types/roadmap'",
)
replace(
    "apps/web/src/lib/portable-roadmap.ts",
    "  est?: string\n  tags?: string[]",
    "  est?: string\n  complexity: TaskComplexity\n  tags?: string[]",
)
replace(
    "apps/web/src/lib/portable-roadmap.ts",
    "        ...(task.est !== undefined ? { est: task.est } : {}),\n        ...(task.tags",
    "        ...(task.est !== undefined ? { est: task.est } : {}),\n        complexity: getTaskComplexity(task),\n        ...(task.tags",
)

replace(
    "apps/web/src/lib/roadmap-upgrade.ts",
    "import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'",
    "import { parseImportedRoadmapJson } from '@/lib/roadmap-validation'\nimport { getTaskComplexity } from '@/lib/task-complexity'",
)
replace(
    "apps/web/src/lib/roadmap-upgrade.ts",
    "    next: task.next === true,\n    tags,",
    "    next: task.next === true,\n    complexity: getTaskComplexity(task),\n    tags,",
)
replace(
    "apps/web/src/lib/roadmap-upgrade.ts",
    "    return task.next !== afterTask.next ||\n      JSON.stringify(task.tags",
    "    return task.next !== afterTask.next ||\n      getTaskComplexity(task) !== getTaskComplexity(afterTask) ||\n      JSON.stringify(task.tags",
)

replace(
    "apps/web/src/lib/roadmap-validation.ts",
    "import { normalizePortableRoadmapForImport } from '@/lib/portable-roadmap'",
    "import { normalizePortableRoadmapForImport } from '@/lib/portable-roadmap'\nimport {\n  DEFAULT_TASK_COMPLEXITY,\n  getTaskComplexityStructureIssue,\n  isTaskComplexity,\n} from '@/lib/task-complexity'",
)
replace(
    "apps/web/src/lib/roadmap-validation.ts",
    "  | 'task_links_repaired'",
    "  | 'task_links_repaired'\n  | 'complexity_normalized'",
)
replace(
    "apps/web/src/lib/roadmap-validation.ts",
    "  task_links_repaired:\n    'Invalid, duplicate, credential-shaped, or unsupported task links were removed or normalized.',",
    "  task_links_repaired:\n    'Invalid, duplicate, credential-shaped, or unsupported task links were removed or normalized.',\n  complexity_normalized:\n    'Invalid task complexity values were normalized to Medium.',",
)
replace(
    "apps/web/src/lib/roadmap-validation.ts",
    "  const task: Task = { id, title, done: value.done }\n  if (value.next !== undefined) task.next = value.next as boolean",
    "  const complexity = value.complexity === undefined\n    ? DEFAULT_TASK_COMPLEXITY\n    : value.complexity\n  if (!isTaskComplexity(complexity)) throw new Error('task.complexity is invalid')\n  const task: Task = { id, title, done: value.done, complexity }\n  if (value.next !== undefined) task.next = value.next as boolean",
)
replace(
    "apps/web/src/lib/roadmap-validation.ts",
    "  'id', 'title', 'done', 'next', 'recommended', 'est', 'tags', 'assignees', 'deps', 'desc',",
    "  'id', 'title', 'done', 'next', 'recommended', 'est', 'complexity', 'tags', 'assignees', 'deps', 'desc',",
)
replace(
    "apps/web/src/lib/roadmap-validation.ts",
    "  // est: optional string — null → remove\n  if (t.est === null) {",
    "  // complexity: missing defaults silently for backward compatibility; invalid explicit values repair.\n  if (t.complexity === undefined) {\n    t.complexity = DEFAULT_TASK_COMPLEXITY\n  } else if (!isTaskComplexity(t.complexity)) {\n    bump(counts, 'complexity_normalized')\n    t.complexity = DEFAULT_TASK_COMPLEXITY\n  }\n\n  // est: optional string — null → remove\n  if (t.est === null) {",
)
replace(
    "apps/web/src/lib/roadmap-validation.ts",
    "  return (raw as unknown[]).map((p) => validatePhase(p))\n}",
    "  const phases = (raw as unknown[]).map((p) => validatePhase(p))\n  const allTasks = phases.flatMap((phase) => phase.tasks)\n  for (const task of allTasks) {\n    const complexityIssue = getTaskComplexityStructureIssue(task, allTasks)\n    if (complexityIssue) throw new Error(`task ${task.id}: ${complexityIssue}`)\n  }\n  return phases\n}",
)

# Partial-write and activity contracts.
replace(
    "apps/web/src/services/roadmap-crud.service.ts",
    "  'title' | 'desc' | 'est' | 'assignees' | 'tags' | 'links'",
    "  'title' | 'desc' | 'est' | 'complexity' | 'assignees' | 'tags' | 'links'",
)
replace(
    "apps/web/src/lib/activity-changes.ts",
    "  'est',\n  'assignees',",
    "  'est',\n  'complexity',\n  'assignees',",
)
replace(
    "apps/web/src/lib/activity-changes.ts",
    "  est: 'estimate',\n  assignees: 'assignees',",
    "  est: 'estimate',\n  complexity: 'complexity',\n  assignees: 'assignees',",
)
replace(
    "apps/web/src/lib/activity-changes.ts",
    "    field === 'est' || field === 'assignees' || field === 'tags' || field === 'links'",
    "    field === 'est' || field === 'complexity' || field === 'assignees' || field === 'tags' || field === 'links'",
)

# ---------------------------------------------------------------------------
# API contract and authoritative domain validation
# ---------------------------------------------------------------------------
api_schema = Path("apps/api/src/api/schemas/tasks.py")
api_text = api_schema.read_text()
needle = "    est: str | None = Field(default=None, max_length=TASK_EST_MAX)\n"
if api_text.count(needle) != 2:
    raise SystemExit(
        f"apps/api/src/api/schemas/tasks.py: expected two task estimate declarations, found {api_text.count(needle)}"
    )
complexity_decl = (
    '    complexity: Literal["very_low", "low", "medium", "high", "very_high"] = "medium"\n'
)
api_schema.write_text(api_text.replace(needle, needle + complexity_decl))

replace(
    "apps/api/src/api/services/roadmap_validation.py",
    "    phase_by_task_id = {\n        task.id: phase.id\n        for phase in phases\n        for task in phase.tasks\n    }\n",
    "    phase_by_task_id = {\n        task.id: phase.id\n        for phase in phases\n        for task in phase.tasks\n    }\n    children_by_parent_id: dict[str, list] = {}\n    for task in all_tasks:\n        if task.parentId:\n            children_by_parent_id.setdefault(task.parentId, []).append(task)\n",
)
replace(
    "apps/api/src/api/services/roadmap_validation.py",
    "            if task.done and any((task.claimedBy, task.claimedById, task.claimedAt)):\n                errors.append(f\"completed task {task.id!r} must not remain claimed\")\n\n            if task.parentId:",
    "            if task.done and any((task.claimedBy, task.claimedById, task.claimedAt)):\n                errors.append(f\"completed task {task.id!r} must not remain claimed\")\n\n            if task.complexity == \"very_high\":\n                direct_children = children_by_parent_id.get(task.id, [])\n                if task.parentId:\n                    errors.append(\n                        f\"very-high complexity task {task.id!r} must be top-level\"\n                    )\n                elif len(direct_children) < 2:\n                    errors.append(\n                        f\"very-high complexity task {task.id!r} requires at least two direct subtasks\"\n                    )\n                elif task.done and any(not child.done for child in direct_children):\n                    errors.append(\n                        f\"very-high complexity task {task.id!r} cannot be complete before its subtasks\"\n                    )\n\n            if task.parentId:",
)

# ---------------------------------------------------------------------------
# Agent/human-readable planning surfaces
# ---------------------------------------------------------------------------
replace(
    "apps/web/src/lib/roadmap-markdown.ts",
    "import { computeTaskDisplayNumbers } from '@/lib/task-display'",
    "import { computeTaskDisplayNumbers } from '@/lib/task-display'\nimport { getTaskComplexityLabel } from '@/lib/task-complexity'",
)
replace(
    "apps/web/src/lib/roadmap-markdown.ts",
    "  if (task.next === true) metadata.push('recommended')\n  if (task.parentId)",
    "  if (task.next === true) metadata.push('recommended')\n  metadata.push(`complexity:${getTaskComplexityLabel(task)}`)\n  if (task.parentId)",
)
replace(
    "packages/roadforge-mcp/src/roadforge-client.mjs",
    "  if (task.next) flags.push('next')\n  if (task.est)",
    "  if (task.next) flags.push('next')\n  if (task.complexity) flags.push(`complexity:${task.complexity}`)\n  if (task.est)",
)

for path in [
    "apps/web/src/lib/roadmap-generator-template.ts",
    "docs/roadforge-roadmap-generator-template.txt",
]:
    replace(
        path,
        '          "est": "1 day",\n          "tags":',
        '          "est": "1 day",\n          "complexity": "medium",\n          "tags":',
    )
    replace(
        path,
        '          "est": "2 days",\n          "tags":',
        '          "est": "2 days",\n          "complexity": "low",\n          "tags":',
    )
    replace(
        path,
        '- Phase `progress` is a number from 0 to 100 and should reflect task completion.\n',
        '- Phase `progress` is a number from 0 to 100 and should reflect task completion.\n- Every generated task must include `complexity`: `very_low`, `low`, `medium`, `high`, or `very_high`. Use complexity as the primary planning signal; time estimates are optional heuristics.\n- `very_high` is only valid for top-level tasks and requires at least two direct subtasks. Put actionable recommendations on ready subtasks rather than on an undecomposed parent.\n',
    )
    replace(
        path,
        '- Optional task fields include `recommended`, `est`, `tags`, `assignees`, `deps`, `desc`, `parent`, and supported credential-free external links.',
        '- Optional task fields include `recommended`, `est`, `tags`, `assignees`, `deps`, `desc`, `parent`, and supported credential-free external links. `complexity` is required for newly generated tasks.',
    )

# ---------------------------------------------------------------------------
# Current documentation
# ---------------------------------------------------------------------------
Path("docs/task-complexity.md").write_text(
    """# Task complexity\n\nStatus: Current product contract\n\nRoadForge treats task complexity as a planning signal separate from time estimation. Time estimates remain optional heuristics; complexity is the more durable indication of uncertainty, coordination, and structural difficulty.\n\n## Ordered scale\n\n| Rank | Value | UI label | Meaning |\n| --- | --- | --- | --- |\n| 1 | `very_low` | Very low | Routine work with minimal uncertainty or coordination. |\n| 2 | `low` | Low | Straightforward work with few moving parts. |\n| 3 | `medium` | Medium | Normal task complexity with some coordination or uncertainty. |\n| 4 | `high` | High | Several moving parts, dependencies, or meaningful uncertainty. |\n| 5 | `very_high` | Very high | Too broad to execute safely as one task; decomposition is mandatory. |\n\n`medium` is the compatibility/default value for older tasks that do not carry the field.\n\n## Decomposition rule\n\nA `very_high` task must be a top-level task with at least two direct subtasks. RoadForge enforces this in browser mutation/import paths and in the API domain validator. The current workspace supports one subtask level, so nested tasks cannot themselves be `very_high`.\n\nA very-high parent cannot be completed while one of its direct subtasks is unfinished. Removing subtasks is also blocked when it would leave a very-high parent below the two-subtask minimum.\n\n## Roadmap-building guidance\n\n- Use complexity before time estimates when deciding whether work is actionable as written.\n- Treat `high` as a strong signal to consider decomposition.\n- Treat `very_high` as structurally non-actionable until it has been split.\n- Prefer `recommended` on ready leaf work/subtasks rather than on a broad very-high parent.\n- Keep `est` only when a rough duration is genuinely useful; it is not a confidence score and does not replace complexity.\n\n## Portable data\n\nPortable v2 JSON exports include `complexity` on every task. Existing v1/v2 files without the field remain compatible and normalize to `medium`. Newly generated RoadForge JSON should always emit an explicit complexity value.\n"""
)
replace(
    "docs/README.md",
    "| Understand canonical data ownership | [`architecture/source-of-truth-rules.md`](architecture/source-of-truth-rules.md) |\n| Understand shared access |",
    "| Understand canonical data ownership | [`architecture/source-of-truth-rules.md`](architecture/source-of-truth-rules.md) |\n| Understand task complexity and decomposition | [`task-complexity.md`](task-complexity.md) |\n| Understand shared access |",
)
replace(
    "docs/README.md",
    "- `frontend-foundation.md`\n- `performance.md`",
    "- `frontend-foundation.md`\n- `task-complexity.md`\n- `performance.md`",
)
replace(
    "CHANGELOG.md",
    "### Product and visual refinements\n\n",
    "### Product and visual refinements\n\n- Add an ordered five-level task complexity signal (`Very low` → `Very high`), default legacy tasks to `Medium`, require very-high top-level tasks to have at least two direct subtasks, and make complexity visible in editing, task metadata, portable exports, Markdown, MCP output, and roadmap-generation guidance. Time estimates remain optional heuristics.\n",
)

# ---------------------------------------------------------------------------
# Regression coverage
# ---------------------------------------------------------------------------
Path("apps/web/src/lib/__tests__/task-complexity.test.ts").write_text(
    """import { describe, expect, it } from 'vitest'\nimport { getTaskCompletionBlocker } from '@/lib/task-completion'\nimport {\n  DEFAULT_TASK_COMPLEXITY,\n  getTaskComplexity,\n  getTaskComplexityStructureIssue,\n} from '@/lib/task-complexity'\nimport type { Task } from '@/types/roadmap'\n\nfunction task(id: string, overrides: Partial<Task> = {}): Task {\n  return { id, title: id, done: false, ...overrides }\n}\n\ndescribe('task complexity', () => {\n  it('defaults legacy tasks to Medium', () => {\n    expect(getTaskComplexity(task('legacy'))).toBe(DEFAULT_TASK_COMPLEXITY)\n  })\n\n  it('requires two direct subtasks for Very high top-level work', () => {\n    const parent = task('parent', { complexity: 'very_high' })\n    expect(getTaskComplexityStructureIssue(parent, [parent])).toContain('at least two direct subtasks')\n\n    const one = task('one', { parentId: 'parent' })\n    expect(getTaskComplexityStructureIssue(parent, [parent, one])).toContain('at least two direct subtasks')\n\n    const two = task('two', { parentId: 'parent' })\n    expect(getTaskComplexityStructureIssue(parent, [parent, one, two])).toBeNull()\n  })\n\n  it('does not allow Very high on nested work', () => {\n    const nested = task('nested', { parentId: 'parent', complexity: 'very_high' })\n    expect(getTaskComplexityStructureIssue(nested, [task('parent'), nested])).toContain('top-level')\n  })\n\n  it('blocks completion while a Very high task is structurally undecomposed', () => {\n    const parent = task('parent', { complexity: 'very_high' })\n    expect(getTaskCompletionBlocker(parent, [parent])).toContain('at least two direct subtasks')\n  })\n})\n"""
)

Path("apps/api/tests/test_task_complexity.py").write_text(
    """import pytest\nfrom fastapi import HTTPException\n\nfrom api.schemas.roadmap import PhaseDTO\nfrom api.services.roadmap_validation import validate_roadmap_domain\n\n\ndef phase(tasks: list[dict]) -> PhaseDTO:\n    return PhaseDTO.model_validate({\n        'id': 'phase-1',\n        'num': '01',\n        'name': 'Phase',\n        'color': '#808080',\n        'status': 'active',\n        'progress': 0,\n        'tasks': tasks,\n    })\n\n\ndef test_very_high_requires_two_direct_subtasks() -> None:\n    phases = [phase([{\n        'id': 'parent',\n        'title': 'Parent',\n        'done': False,\n        'complexity': 'very_high',\n    }])]\n    with pytest.raises(HTTPException) as exc:\n        validate_roadmap_domain(phases)\n    assert 'requires at least two direct subtasks' in str(exc.value.detail)\n\n\ndef test_very_high_accepts_two_direct_subtasks() -> None:\n    phases = [phase([\n        {'id': 'parent', 'title': 'Parent', 'done': False, 'complexity': 'very_high'},\n        {'id': 'one', 'title': 'One', 'done': False, 'complexity': 'medium', 'parentId': 'parent'},\n        {'id': 'two', 'title': 'Two', 'done': False, 'complexity': 'high', 'parentId': 'parent'},\n    ])]\n    validate_roadmap_domain(phases)\n\n\ndef test_nested_task_cannot_be_very_high() -> None:\n    phases = [phase([\n        {'id': 'parent', 'title': 'Parent', 'done': False, 'complexity': 'medium'},\n        {'id': 'nested', 'title': 'Nested', 'done': False, 'complexity': 'very_high', 'parentId': 'parent'},\n    ])]\n    with pytest.raises(HTTPException) as exc:\n        validate_roadmap_domain(phases)\n    assert 'must be top-level' in str(exc.value.detail)\n"""
)

# Keep the final branch clean: these files exist only to apply the transformation.
Path(".github/workflows/apply-task-complexity.yml").unlink(missing_ok=True)
Path("tools/apply-task-complexity.py").unlink(missing_ok=True)
