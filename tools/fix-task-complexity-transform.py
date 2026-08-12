from pathlib import Path

path = Path('tools/apply-task-complexity.py')
text = path.read_text()

old_loop = '''for path in [
    "apps/web/src/lib/roadmap-generator-template.ts",
    "docs/roadforge-roadmap-generator-template.txt",
]:
'''
new_loop = '''for path in [
    "docs/roadforge-roadmap-generator-template.txt",
]:
'''
if text.count(old_loop) != 1:
    raise SystemExit('generator loop header not found exactly once')
text = text.replace(old_loop, new_loop)

marker = '''# ---------------------------------------------------------------------------
# Current documentation
# ---------------------------------------------------------------------------
'''
insert = r'''# TypeScript stores Markdown backticks escaped inside its template literal.
replace(
    "apps/web/src/lib/roadmap-generator-template.ts",
    '          "est": "1 day",\n          "tags":',
    '          "est": "1 day",\n          "complexity": "medium",\n          "tags":',
)
replace(
    "apps/web/src/lib/roadmap-generator-template.ts",
    '          "est": "2 days",\n          "tags":',
    '          "est": "2 days",\n          "complexity": "low",\n          "tags":',
)
replace(
    "apps/web/src/lib/roadmap-generator-template.ts",
    '- Phase \\`progress\\` is a number from 0 to 100 and should reflect task completion.\n',
    '- Phase \\`progress\\` is a number from 0 to 100 and should reflect task completion.\n- Every generated task must include \\`complexity\\`: \\`very_low\\`, \\`low\\`, \\`medium\\`, \\`high\\`, or \\`very_high\\`. Use complexity as the primary planning signal; time estimates are optional heuristics.\n- \\`very_high\\` is only valid for top-level tasks and requires at least two direct subtasks. Put actionable recommendations on ready subtasks rather than on an undecomposed parent.\n',
)
replace(
    "apps/web/src/lib/roadmap-generator-template.ts",
    '- Optional task fields include \\`recommended\\`, \\`est\\`, \\`tags\\`, \\`assignees\\`, \\`deps\\`, \\`desc\\`, \\`parent\\`, and supported credential-free external links.',
    '- Optional task fields include \\`recommended\\`, \\`est\\`, \\`tags\\`, \\`assignees\\`, \\`deps\\`, \\`desc\\`, \\`parent\\`, and supported credential-free external links. \\`complexity\\` is required for newly generated tasks.',
)

'''
if text.count(marker) != 1:
    raise SystemExit('current documentation marker not found exactly once')
text = text.replace(marker, insert + marker)
path.write_text(text)
