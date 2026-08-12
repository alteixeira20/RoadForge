from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count}, found {actual}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count))


# Existing production-startup tests must provide the newly required canonical HTTPS frontend.
replace(
    "apps/api/tests/test_security_hardening.py",
    '    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@db.example.com/roadforge")\n    get_settings.cache_clear()\n',
    '    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@db.example.com/roadforge")\n'
    '    monkeypatch.setenv("ROADFORGE_CORS_ORIGINS", "https://app.example.com")\n'
    '    monkeypatch.setenv("ROADFORGE_WEB_BASE_URL", "https://app.example.com")\n'
    '    get_settings.cache_clear()\n',
)
replace(
    "apps/api/tests/test_security_hardening.py",
    '        cors_origins=["https://app.example.com", "https://admin.example.com:8443"],\n    )\n\n    settings.validate_startup_security()\n',
    '        cors_origins=["https://app.example.com", "https://admin.example.com:8443"],\n'
    '        web_base_url="https://app.example.com",\n'
    '    )\n\n    settings.validate_startup_security()\n',
)

# Remove imports intentionally not needed by the integration resource tests.
replace(
    "apps/api/tests/test_security_resource_limits.py",
    "from datetime import datetime, timezone\n",
    "",
)

# Expose hard ceilings through the maintained self-hosted deployment contract.
replace(
    "deploy/self-hosted/compose.yaml",
    "      ROADFORGE_API_WORKERS: ${ROADFORGE_API_WORKERS:-1}\n",
    "      ROADFORGE_API_WORKERS: ${ROADFORGE_API_WORKERS:-1}\n"
    "      ROADFORGE_MAX_SERVER_ROADMAPS: ${ROADFORGE_MAX_SERVER_ROADMAPS:-500}\n"
    "      ROADFORGE_MAX_ACTIVE_SESSIONS_PER_SHARE_LINK: ${ROADFORGE_MAX_ACTIVE_SESSIONS_PER_SHARE_LINK:-128}\n"
    "      ROADFORGE_MAX_REALTIME_STREAMS_PER_PARTICIPANT: ${ROADFORGE_MAX_REALTIME_STREAMS_PER_PARTICIPANT:-3}\n"
    "      ROADFORGE_MAX_ACTIVITY_LOGS_PER_ROADMAP: ${ROADFORGE_MAX_ACTIVITY_LOGS_PER_ROADMAP:-2000}\n"
    "      ROADFORGE_MAX_VERSION_HISTORY_BYTES_PER_ROADMAP: ${ROADFORGE_MAX_VERSION_HISTORY_BYTES_PER_ROADMAP:-33554432}\n",
)
replace(
    "deploy/self-hosted/.env.example",
    "ROADFORGE_API_WORKERS=1\n",
    "ROADFORGE_API_WORKERS=1\n\n"
    "# Internet-facing resource ceilings. Tune deliberately for larger self-hosted\n"
    "# deployments; do not remove the bounds without equivalent admission control.\n"
    "ROADFORGE_MAX_SERVER_ROADMAPS=500\n"
    "ROADFORGE_MAX_ACTIVE_SESSIONS_PER_SHARE_LINK=128\n"
    "ROADFORGE_MAX_REALTIME_STREAMS_PER_PARTICIPANT=3\n"
    "ROADFORGE_MAX_ACTIVITY_LOGS_PER_ROADMAP=2000\n"
    "ROADFORGE_MAX_VERSION_HISTORY_BYTES_PER_ROADMAP=33554432\n",
)

# Retention policy now has active write-time ceilings as well as age-based purge.
replace(
    "docs/server-data-retention.md",
    "These minimums are enforced in the service layer, not only by CLI documentation.\n\n",
    "These minimums are enforced in the service layer, not only by CLI documentation.\n\n"
    "## Active resource ceilings\n\n"
    "Age-based retention is not the only storage bound. Internet-facing writes also enforce\n"
    "hard configurable ceilings so a valid anonymous or invite-bearing client cannot grow\n"
    "server state indefinitely between purge runs. Maintained defaults are:\n\n"
    "| Resource | Default | Behavior at limit |\n"
    "| --- | ---: | --- |\n"
    "| total server roadmap records | 500 | new roadmap creation returns `503`; soft-deleted rows continue to count until hard purge |\n"
    "| active sessions per share link | 128 | further joins through that invite return `429` until sessions expire/revoke |\n"
    "| concurrent SSE streams per participant | 3 | further event streams return `429` |\n"
    "| activity rows per roadmap | 2,000 | oldest rows are trimmed transactionally on subsequent writes |\n"
    "| restore-history bytes per roadmap | 32 MiB | oldest restore points are trimmed while always preserving the newest three |\n\n"
    "The existing 100-version count ceiling remains in force alongside the byte ceiling.\n"
    "These values are admission/resource-safety defaults, not product capacity claims.\n"
    "Self-hosted operators may raise them after measuring storage/concurrency and establishing\n"
    "equivalent monitoring, backup and abuse controls.\n\n",
)

# Security index and changelog must point at the current audit delta.
replace(
    "docs/security/README.md",
    "- [Internet-facing security audit — 2026-08-12](./internet-facing-audit-2026-08-12.md) — consolidated threat model, findings, remediations, residual risks, and deployment actions for the current hardening candidate.\n",
    "- [Internet-facing security audit — 2026-08-12](./internet-facing-audit-2026-08-12.md) — consolidated threat model and first Internet-facing hardening pass.\n"
    "- [Post-hardening Internet-facing audit — 2026-08-12](./post-hardening-audit-2026-08-12.md) — follow-up resource-exhaustion, production-origin and SSE lifecycle findings/remediations.\n",
)
replace(
    "CHANGELOG.md",
    "### Security hardening\n\n",
    "### Security hardening\n\n"
    "- Follow up the Internet-facing audit with HTTPS-only production frontend origins, bounded concurrent SSE streams and slow-consumer queues, per-invite active-session ceilings, a total server roadmap-record ceiling, bounded activity/version-history storage, and terminal SSE authorization on roadmap deletion/session expiry.\n",
)

# Keep the final candidate free of temporary applicators/workflows.
for temporary in [
    ".github/workflows/apply-security-reaudit.yml",
    "tools/apply-security-reaudit.py",
    "tools/fix-security-reaudit-applicator.py",
    "tools/polish-security-reaudit.py",
    "tools/finalize-security-reaudit.py",
]:
    Path(temporary).unlink(missing_ok=True)
