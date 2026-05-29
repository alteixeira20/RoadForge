"""
Operator script: backfill relational projection tables for all active roadmaps.

Usage:
    python -m api.scripts.backfill_projection [--limit N] [--verify]
    python -m api.scripts.backfill_projection [--limit N] --verify-only

Reads from the database configured by DATABASE_URL (or .env.local).
Rebuilds projection rows from snapshot_json for each non-deleted roadmap and
commits after each one. Verification mode checks projection parity after
backfill, while verify-only checks the current projection rows without writing.

snapshot_json remains canonical — this script only writes projection tables.
"""

from __future__ import annotations

import argparse
import asyncio

from api.database import async_session_factory
from api.services.roadmap_projection_service import (
    ProjectionDriftReport,
    backfill_and_report_projection_drift,
    report_projection_drift,
)


def _print_report(report: ProjectionDriftReport) -> None:
    print("Projection parity verification:")
    print(f"  checked roadmaps: {report.checked_count}")
    print(f"  successful parity: {report.successful_parity_count}")
    print(f"  drift/error count: {report.drift_count}")
    print(
        "  projection-read safe to enable: "
        f"{'yes' if report.safe_to_enable_projection_reads else 'no'}"
    )

    for finding in report.findings:
        if finding.ok:
            continue
        print(f"  drift: {finding.roadmap_id} ({finding.issue_count} issue(s))")
        for issue in finding.issues[:5]:
            print(f"    - {issue}")


async def _run(limit: int | None, *, verify: bool, verify_only: bool) -> int:
    async with async_session_factory() as db:
        if verify_only:
            report = await report_projection_drift(db, limit=limit)
            _print_report(report)
            return 0 if report.safe_to_enable_projection_reads else 1

        result = await backfill_and_report_projection_drift(db, limit=limit, verify=verify)
        print(f"Backfill complete: {result.backfilled_count} roadmap(s) processed.")
        if result.drift_report is None:
            return 0

        _print_report(result.drift_report)
        return 0 if result.drift_report.safe_to_enable_projection_reads else 1


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill relational projection tables from snapshot_json."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process at most N roadmaps (default: all).",
    )
    verify_group = parser.add_mutually_exclusive_group()
    verify_group.add_argument(
        "--verify",
        action="store_true",
        help="Verify projection parity after backfill.",
    )
    verify_group.add_argument(
        "--verify-only",
        action="store_true",
        help="Verify current projection parity without rebuilding projection rows.",
    )
    args = parser.parse_args()

    raise SystemExit(
        asyncio.run(_run(args.limit, verify=args.verify, verify_only=args.verify_only))
    )


if __name__ == "__main__":
    main()
