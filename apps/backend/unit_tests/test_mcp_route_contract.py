"""Check the standalone MCP client's requests against the published API schema."""

import re
from pathlib import Path

from api.main import create_app

REPOSITORY = Path(__file__).resolve().parents[3]
MCP_CLIENT = REPOSITORY / "packages/roadforge-mcp/src/roadforge-client.mjs"
ROADMAP = "/api/roadmaps/{roadmap_id}"
CLIENT = ROADMAP + "/client"
COMPACT = "CompactMutationResponse"

# Value: success status, response model, JSON request model when present.
CONTRACT = {
    ("post", "/api/roadmaps/join"): ("200", "JoinRoadmapResponse", "JoinRoadmapRequest"),
    ("get", ROADMAP): ("200", "RoadmapResponse", None),
    ("get", ROADMAP + "/summary"): ("200", "RoadmapSummaryResponse", None),
    ("get", ROADMAP + "/revision"): ("200", "RoadmapRevisionResponse", None),
    ("get", ROADMAP + "/tasks/search"): ("200", "TaskSearchResponse", None),
    ("get", ROADMAP + "/tasks/{task_id}"): ("200", "TaskDetailResponse", None),
    ("get", ROADMAP + "/context"): ("200", "RoadmapContextResponse", None),
    ("patch", CLIENT + "/tasks/{task_id}"): ("200", COMPACT, "PatchTaskRequest"),
    ("patch", CLIENT + "/tasks/{task_id}/done"): ("200", COMPACT, "PatchTaskDoneRequest"),
    ("post", CLIENT + "/phases/{phase_id}/tasks"): ("201", COMPACT, "CreateTaskStructureRequest"),
    ("delete", CLIENT + "/tasks/{task_id}"): ("200", COMPACT, None),
    ("put", CLIENT + "/tasks/{task_id}/dependencies/{dependency_id}"): ("200", COMPACT, None),
    ("delete", CLIENT + "/tasks/{task_id}/dependencies/{dependency_id}"): ("200", COMPACT, None),
    ("post", CLIENT + "/phases"): ("201", COMPACT, "CreatePhaseRequest"),
    ("patch", CLIENT + "/phases/{phase_id}"): ("200", COMPACT, "PatchPhaseRequest"),
    ("delete", CLIENT + "/phases/{phase_id}"): ("200", COMPACT, None),
    ("patch", CLIENT + "/name"): ("200", COMPACT, "PatchRoadmapNameRequest"),
    ("post", CLIENT + "/tags"): ("201", COMPACT, "CreateTagRequest"),
}

RESPONSE_KEYS = {
    "JoinRoadmapResponse": {"roadmap_id", "session_token"},
    "RoadmapResponse": {"id", "name", "phases", "updated_at"},
    "RoadmapSummaryResponse": {"roadmap_id", "updated_at", "phases", "next_tasks"},
    "RoadmapRevisionResponse": {"roadmap_id", "updated_at"},
    "TaskSearchResponse": {"roadmap_id", "updated_at", "results"},
    "TaskDetailResponse": {"roadmap_id", "updated_at", "phase", "task"},
    "RoadmapContextResponse": {"roadmap_id", "updated_at", "results"},
    COMPACT: {"roadmap_id", "updated_at", "affected_entity_type", "affected_entity_id"},
}


def _client_requests(source: str) -> set[tuple[str, str]]:
    def parameter(match: re.Match) -> str:
        name = re.sub(r"(?<!^)[A-Z]", lambda m: "_" + m[0].lower(), match[1])
        return "{" + name + "}"

    requests = set()
    for name, body in re.findall(r"^  async function (\w+)\((.*?)^  }$", source, re.M | re.S):
        if name in {"roadmapPath", "clientPath"}:
            continue
        path_call = re.search(r"(roadmapPath|clientPath)\(\s*(?:['`]([^'`]*)['`])?", body)
        direct_call = re.search(r"fetchJson\('(/api/roadmaps/[^']+)'", body)
        if path_call:
            prefix = ROADMAP if path_call[1] == "roadmapPath" else CLIENT
            path = prefix + re.sub(
                r"\$\{encodeURIComponent\((\w+)\)\}", parameter, path_call[2] or ""
            )
        elif direct_call:
            path = direct_call[1]
        else:
            continue
        method_expression = re.search(r"\bmethod: ([^\n]+)", body)
        methods = re.findall(r"'([A-Z]+)'", method_expression[1]) if method_expression else ["GET"]
        assert methods, f"Could not determine HTTP method in {name}"
        requests.update((method.lower(), path) for method in methods)
    return requests


def _json_model(container):
    schema = container["content"]["application/json"]["schema"]
    return schema["$ref"].rsplit("/", 1)[1]


def test_mcp_client_uses_registered_routes_and_typed_payloads():
    source = MCP_CLIENT.read_text()
    assert _client_requests(source) == set(CONTRACT)

    schema = create_app().openapi()
    for (method, path), (status, response, request) in CONTRACT.items():
        operation = schema["paths"][path][method]
        assert _json_model(operation["responses"][status]) == response
        if request is None:
            assert "requestBody" not in operation
        else:
            assert _json_model(operation["requestBody"]) == request

    for model, keys in RESPONSE_KEYS.items():
        assert keys <= schema["components"]["schemas"][model]["properties"].keys()
