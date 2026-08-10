"""Bounded RoadForge server-data retention command.

Dry-run is the default. Destructive execution requires both --execute and the
literal confirmation string PURGE. Output contains counts and policy values only;
it never prints roadmap content, participant names, tokens, or activity payloads.

Examples:
    python -m api.scripts.purge_retention
    python -m api.scripts.purge_retention --batch-limit 50
    python -m api.scripts.purge_retention --execute --confirm PURGE
"""

from __future__ import annotations

import argparse
import asyncio
import json

from api.database import async_session_factory
from api.services.retention_service import (
    RetentionPolicy,
    build_retention_plan,
    execute_retention_plan,
)

_CONFIRMATION = "PURGE"


def _policy_from_args(args: argparse.Namespace) -> RetentionPolicy:
    return RetentionPolicy(
        session_grace_days=args.session_grace_days,
        activity_days=args.activity_days,
        version_days=args.version_days,
        deleted_roadmap_days=args.deleted_roadmap_days,
        preserve_versions_per_roadmap=args.preserve_versions,
        batch_limit=args.batch_limit,
    )


def _report(mode: str, policy: RetentionPolicy, counts: dict[str, int]) -> None:
    payload = {
        "mode": mode,
        "policy": {
            "session_grace_days": policy.session_grace_days,
            "activity_days": policy.activity_days,
            "version_days": policy.version_days,
            "deleted_roadmap_days": policy.deleted_roadmap_days,
            "preserve_versions_per_roadmap": policy.preserve_versions_per_roadmap,
            "batch_limit_per_category": policy.batch_limit,
        },
        "counts": counts,
    }
    print(json.dumps(payload, sort_keys=True))


async def _run(args: argparse.Namespace) -> int:
    policy = _policy_from_args(args)
    try:
        policy.validate()
    except ValueError as exc:
        print(json.dumps({"error": str(exc)}, sort_keys=True))
        return 2

    if args.execute and args.confirm != _CONFIRMATION:
        print(
            json.dumps(
                {
                    "error": (
                        f"destructive execution requires --confirm {_CONFIRMATION}"
                    )
                },
                sort_keys=True,
            )
        )
        return 2
    if not args.execute and args.confirm is not None:
        print(json.dumps({"error": "--confirm is valid only with --execute"}, sort_keys=True))
        return 2

    async with async_session_factory() as db:
        plan = await build_retention_plan(db, policy)
        _report("execute-preview" if args.execute else "dry-run", policy, plan.counts())

        if not args.execute:
            return 0

        result = await execute_retention_plan(db, plan)
        _report(
            "executed",
            policy,
            {
                "expired_or_revoked_sessions": result.expired_or_revoked_sessions,
                "old_activity_rows": result.old_activity_rows,
                "old_restore_points": result.old_restore_points,
                "soft_deleted_roadmaps": result.soft_deleted_roadmaps,
                "total_rows": result.total_rows,
            },
        )
        return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Plan or execute bounded RoadForge retention cleanup. Dry-run is the default."
        )
    )
    parser.add_argument("--session-grace-days", type=int, default=7)
    parser.add_argument("--activity-days", type=int, default=180)
    parser.add_argument("--version-days", type=int, default=90)
    parser.add_argument("--deleted-roadmap-days", type=int, default=30)
    parser.add_argument(
        "--preserve-versions",
        type=int,
        default=3,
        metavar="N",
        help="Always preserve at least the newest N restore points per active roadmap.",
    )
    parser.add_argument(
        "--batch-limit",
        type=int,
        default=100,
        metavar="N",
        help="Maximum rows selected per retention category in this run.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply the planned deletions. Without this flag the command is read-only.",
    )
    parser.add_argument(
        "--confirm",
        default=None,
        metavar="PURGE",
        help="Required literal confirmation for --execute.",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_run(args)))


if __name__ == "__main__":
    main()
