# Task complexity

Status: Current product contract

RoadForge treats task complexity as a planning signal separate from time estimation. Time estimates remain optional heuristics; complexity is the more durable indication of uncertainty, coordination, and structural difficulty.

## Ordered scale

| Rank | Value | UI label | Meaning |
| --- | --- | --- | --- |
| 1 | `very_low` | Very low | Routine work with minimal uncertainty or coordination. |
| 2 | `low` | Low | Straightforward work with few moving parts. |
| 3 | `medium` | Medium | Normal task complexity with some coordination or uncertainty. |
| 4 | `high` | High | Several moving parts, dependencies, or meaningful uncertainty. |
| 5 | `very_high` | Very high | Too broad to execute safely as one task; decomposition is mandatory. |

`medium` is the compatibility/default value for older tasks that do not carry the field.

## Decomposition rule

A `very_high` task must be a top-level task with at least two direct subtasks. RoadForge enforces this in browser mutation/import paths and in the API domain validator. The current workspace supports one subtask level, so nested tasks cannot themselves be `very_high`.

The editor only enables `Very high` after the top-level task already has at least two direct subtasks. This makes decomposition the prerequisite for selecting the terminal complexity tier instead of allowing an invalid state that fails only on save.

A very-high parent cannot be completed while one of its direct subtasks is unfinished. Removing subtasks is also blocked when it would leave a very-high parent below the two-subtask minimum.

## Roadmap-building guidance

- Use complexity before time estimates when deciding whether work is actionable as written.
- Treat `high` as a strong signal to consider decomposition.
- Treat `very_high` as structurally non-actionable until it has been split.
- Prefer `recommended` on ready leaf work/subtasks rather than on a broad very-high parent.
- Keep `est` only when a rough duration is genuinely useful; it is not a confidence score and does not replace complexity.

## Portable data

Portable v2 JSON exports include `complexity` on every task. Existing v1/v2 files without the field remain compatible and normalize to `medium`. Newly generated RoadForge JSON should always emit an explicit complexity value.
