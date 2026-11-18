"""Keep API dependencies directed from composition to domain foundations."""

import ast
from importlib.util import resolve_name
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1] / "src" / "api"
FOUNDATION = {"config", "database", "models", "shared"}
DOMAIN = {
    "roadmaps", "tags", "tasks", "phases", "history", "sharing",
    "collaboration", "realtime", "retention", "agent_client",
}
ALLOWED = {
    "api": set(),
    "features": set(),
    "config": set(),
    "database": {"config"},
    "models": set(),
    "shared": {"models", "config", "database"},
    "middleware": {"shared", "config"},
    "roadmaps": FOUNDATION,
    "collaboration": FOUNDATION,
    "realtime": FOUNDATION,
    "sharing": FOUNDATION | {"roadmaps"},
    "tasks": FOUNDATION | {"roadmaps"},
    "tags": FOUNDATION | {"roadmaps"},
    "history": FOUNDATION | {"roadmaps"},
    "phases": FOUNDATION | {"roadmaps", "tasks"},
    "retention": FOUNDATION | {"tasks"},
    "agent_client": FOUNDATION | {"phases", "tasks", "tags", "roadmaps"},
    "routers": DOMAIN,
    "scripts": FOUNDATION | {"roadmaps", "retention"},
    "main": FOUNDATION | {"routers", "middleware"},
}


def _owner(module: str) -> str:
    parts = module.split(".")
    if len(parts) == 1:
        return "api"
    if parts[1] == "features" and len(parts) > 2:
        return parts[2]
    return parts[1]


def _is_router(module: str) -> bool:
    return module.startswith("api.routers.") or module.split(".")[-1].endswith("router")


def _imports(node: ast.AST, module: str, path: Path) -> set[str]:
    if isinstance(node, ast.Import):
        return {alias.name for alias in node.names}
    if isinstance(node, ast.ImportFrom):
        package = module if path.name == "__init__.py" else module.rsplit(".", 1)[0]
        imported_from = resolve_name("." * node.level + (node.module or ""), package)
        return {imported_from} | {f"{imported_from}.{alias.name}" for alias in node.names}
    return set()


def test_api_import_graph_and_transport_boundaries():
    modules = {}
    for path in API_ROOT.rglob("*.py"):
        parts = path.relative_to(API_ROOT).with_suffix("").parts
        if parts[-1] == "__init__":
            parts = parts[:-1]
        modules[".".join(("api", *parts))] = path

    graph = {module: set() for module in modules}
    violations = []
    for module, path in modules.items():
        owner = _owner(module)
        assert owner in ALLOWED, f"No architecture owner for {module}"
        nodes = list(ast.walk(ast.parse(path.read_text())))
        is_router = _is_router(module)
        response_names = {"Response", "StreamingResponse", "JSONResponse"}
        for node in nodes:
            if isinstance(node, ast.ImportFrom) and node.module in {"fastapi", "fastapi.responses"}:
                response_names.update(
                    alias.asname for alias in node.names
                    if alias.asname and alias.name in response_names
                )
            for target in _imports(node, module, path).intersection(modules):
                if target == module or module.startswith(f"{target}."):
                    continue
                graph[module].add(target)
                target_owner = _owner(target)
                if target_owner != owner and target_owner not in ALLOWED[owner]:
                    violations.append(f"{module} imports {target}")
                if _is_router(target) and not (is_router or owner == "main"):
                    violations.append(f"{module} imports transport module {target}")
            if isinstance(node, ast.Call):
                name = getattr(node.func, "attr", getattr(node.func, "id", ""))
                if is_router and name in {"commit", "rollback"}:
                    violations.append(f"{module}:{node.lineno} owns a transaction")
                if owner in DOMAIN and not is_router and name in response_names:
                    violations.append(f"{module}:{node.lineno} constructs an HTTP response")
    assert not violations, "\n".join(violations)

    visiting = []
    visited = set()

    def visit(module):
        assert module not in visiting, " -> ".join([*visiting, module])
        if module in visited:
            return
        visiting.append(module)
        for target in sorted(graph[module]):
            visit(target)
        visiting.pop()
        visited.add(module)

    for module in graph:
        visit(module)
