"""
Operator script: backfill relational projection tables for all active roadmaps.

Usage:
    python -m api.scripts.backfill_projection [--limit N]

Reads from the database configured by DATABASE_URL (or .env.local).
Calls backfill_all_roadmap_projections, which rebuilds projection rows from
snapshot_json for each non-deleted roadmap and commits after each one.

snapshot_json remains canonical — this script only writes projection tables.
"""

from __future__ import annotations

import argparse
import asyncio

from api.database import async_session_factory
from api.services.roadmap_projection_service import backfill_all_roadmap_projections


async def _run(limit: int | None) -> int:
    async with async_session_factory() as db:
        count = await backfill_all_roadmap_projections(db, limit=limit)
    return count


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
    args = parser.parse_args()

    count = asyncio.run(_run(args.limit))
    print(f"Backfill complete: {count} roadmap(s) processed.")


if __name__ == "__main__":
    main()
