from pathlib import Path

path = Path('apps/api/src/api/services/roadmap_validation.py')
text = path.read_text()
replacements = {
    '                        f"very-high complexity task {task.id!r} requires at least two direct subtasks"\n':
    '                        f"very-high complexity task {task.id!r} requires at least "\n'
    '                        "two direct subtasks"\n',
    '                        f"very-high complexity task {task.id!r} cannot be complete before its subtasks"\n':
    '                        f"very-high complexity task {task.id!r} cannot be complete "\n'
    '                        "before its subtasks"\n',
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f'expected exact Ruff target once: {old!r}')
    text = text.replace(old, new)
path.write_text(text)

Path('.github/workflows/apply-task-complexity-ruff-fix.yml').unlink(missing_ok=True)
Path('tools/fix-task-complexity-ruff.py').unlink(missing_ok=True)
