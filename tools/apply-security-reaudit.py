from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count}, found {actual}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count))


# ---------------------------------------------------------------------------
# Production origin / resource-limit settings
# ---------------------------------------------------------------------------
replace(
    "apps/api/src/api/config.py",
    '    api_workers: int = Field(default=1, gt=0, alias="ROADFORGE_API_WORKERS")\n',
    '    api_workers: int = Field(default=1, gt=0, alias="ROADFORGE_API_WORKERS")\n'
    '    max_server_roadmaps: int = Field(\n'
    '        default=500, ge=1, le=100_000, alias="ROADFORGE_MAX_SERVER_ROADMAPS"\n'
    '    )\n'
    '    max_active_sessions_per_share_link: int = Field(\n'
    '        default=128, ge=1, le=10_000, alias="ROADFORGE_MAX_ACTIVE_SESSIONS_PER_SHARE_LINK"\n'
    '    )\n'
    '    max_realtime_streams_per_participant: int = Field(\n'
    '        default=3, ge=1, le=20, alias="ROADFORGE_MAX_REALTIME_STREAMS_PER_PARTICIPANT"\n'
    '    )\n'
    '    max_activity_logs_per_roadmap: int = Field(\n'
    '        default=2_000, ge=100, le=100_000, alias="ROADFORGE_MAX_ACTIVITY_LOGS_PER_ROADMAP"\n'
    '    )\n'
    '    max_version_history_bytes_per_roadmap: int = Field(\n'
    '        default=32 * 1024 * 1024,\n'
    '        ge=16 * 1024 * 1024,\n'
    '        le=2 * 1024 * 1024 * 1024,\n'
    '        alias="ROADFORGE_MAX_VERSION_HISTORY_BYTES_PER_ROADMAP",\n'
    '    )\n',
)
replace(
    "apps/api/src/api/config.py",
    '        _validate_production_cors_origins(self.cors_origins)\n',
    '        _validate_production_cors_origins(self.cors_origins)\n'
    '        _validate_production_web_base_url(self.web_base_url, self.cors_origins)\n',
)
replace(
    "apps/api/src/api/config.py",
    '        parsed = urlparse(origin)\n'
    '        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path:\n'
    '            raise RuntimeError(\n'
    '                f"ROADFORGE_CORS_ORIGINS entry {origin!r} is not a valid "\n'
    '                "scheme://host[:port] origin."\n'
    '            )\n\n\n',
    '        parsed = urlparse(origin)\n'
    '        if (\n'
    '            parsed.scheme != "https"\n'
    '            or not parsed.netloc\n'
    '            or parsed.username is not None\n'
    '            or parsed.password is not None\n'
    '            or parsed.path\n'
    '            or parsed.params\n'
    '            or parsed.query\n'
    '            or parsed.fragment\n'
    '        ):\n'
    '            raise RuntimeError(\n'
    '                f"ROADFORGE_CORS_ORIGINS entry {origin!r} must be an explicit "\n'
    '                "HTTPS scheme://host[:port] origin in production."\n'
    '            )\n\n\n'
    'def _validate_production_web_base_url(\n'
    '    web_base_url: str, cors_origins: list[str]\n'
    ') -> None:\n'
    '    """Invite credentials must only be delivered through the canonical HTTPS frontend."""\n'
    '    base_url = web_base_url.strip()\n'
    '    parsed = urlparse(base_url)\n'
    '    if (\n'
    '        parsed.scheme != "https"\n'
    '        or not parsed.netloc\n'
    '        or parsed.username is not None\n'
    '        or parsed.password is not None\n'
    '        or parsed.path not in {"", "/"}\n'
    '        or parsed.params\n'
    '        or parsed.query\n'
    '        or parsed.fragment\n'
    '    ):\n'
    '        raise RuntimeError(\n'
    '            "ROADFORGE_WEB_BASE_URL must be an HTTPS origin without credentials, "\n'
    '            "path, query, or fragment in production."\n'
    '        )\n'
    '    canonical = base_url.rstrip("/")\n'
    '    allowed = {origin.strip().rstrip("/") for origin in cors_origins}\n'
    '    if canonical not in allowed:\n'
    '        raise RuntimeError(\n'
    '            "ROADFORGE_WEB_BASE_URL must also appear in ROADFORGE_CORS_ORIGINS."\n'
    '        )\n\n\n',
)

# ---------------------------------------------------------------------------
# Route wiring: global roadmap capacity + bounded SSE leases
# ---------------------------------------------------------------------------
replace(
    "apps/api/src/api/routers/roadmaps.py",
    'from api.services.rate_limit_service import rate_limiter\n',
    'from api.services.rate_limit_service import rate_limiter\n'
    'from api.services.realtime_stream_limit import (\n'
    '    RealtimeStreamLimitUnavailableError,\n'
    '    realtime_stream_registry,\n'
    ')\n',
)
replace(
    "apps/api/src/api/routers/roadmaps.py",
    '    return await create_roadmap(db, payload, settings.web_base_url)\n',
    '    return await create_roadmap(\n'
    '        db, payload, settings.web_base_url, settings.max_server_roadmaps\n'
    '    )\n',
)
replace(
    "apps/api/src/api/routers/roadmaps.py",
    '    # Revocation can still land between the check above and the point the\n'
    '    # stream actually starts receiving events. Close that window by\n'
    '    # subscribing first — any `participant.revoked` publish from this point\n'
    '    # on is guaranteed to reach this subscription — and only then rechecking\n'
    '    # authorization. Because `revoke_participant` commits the revocation\n'
    '    # before publishing it, a revoke that races with this subscribe is\n'
    '    # necessarily visible to the recheck below even on the rare path where\n'
    '    # the queued event itself would otherwise be missed.\n'
    '    subscription = await event_bus.open_subscription(roadmap_id)\n'
    '    if await is_participant_revoked(db, roadmap_id, event_ticket.participant_id):\n'
    '        await subscription.close()\n'
    '        raise HTTPException(status_code=401, detail="Session revoked")\n\n',
    '    # Bound active streams before allocating a backend subscription. A leaked\n'
    '    # participant credential must not be able to accumulate long-lived Redis\n'
    '    # pubsub connections or in-process subscriber state indefinitely.\n'
    '    try:\n'
    '        stream_lease = await realtime_stream_registry.acquire(\n'
    '            roadmap_id, event_ticket.participant_id\n'
    '        )\n'
    '    except RealtimeStreamLimitUnavailableError as exc:\n'
    '        raise HTTPException(\n'
    '            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,\n'
    '            detail="Realtime stream limit temporarily unavailable",\n'
    '        ) from exc\n'
    '    if stream_lease is None:\n'
    '        raise HTTPException(\n'
    '            status_code=status.HTTP_429_TOO_MANY_REQUESTS,\n'
    '            detail="Too many active realtime streams for this participant",\n'
    '        )\n\n'
    '    # Revocation can still land between the check above and the point the\n'
    '    # stream actually starts receiving events. Subscribe first, then recheck.\n'
    '    try:\n'
    '        subscription = await event_bus.open_subscription(roadmap_id)\n'
    '    except Exception:\n'
    '        await stream_lease.release()\n'
    '        raise\n'
    '    if await is_participant_revoked(db, roadmap_id, event_ticket.participant_id):\n'
    '        await subscription.close()\n'
    '        await stream_lease.release()\n'
    '        raise HTTPException(status_code=401, detail="Session revoked")\n\n',
)
replace(
    "apps/api/src/api/routers/roadmaps.py",
    '    async def _is_still_authorized() -> bool:\n'
    '        async with async_session_factory() as session:\n'
    '            return not await is_participant_revoked(\n'
    '                session, roadmap_id, event_ticket.participant_id\n'
    '            )\n',
    '    async def _is_still_authorized() -> bool:\n'
    '        if not await stream_lease.refresh():\n'
    '            return False\n'
    '        async with async_session_factory() as session:\n'
    '            return not await is_participant_revoked(\n'
    '                session, roadmap_id, event_ticket.participant_id\n'
    '            )\n',
)
replace(
    "apps/api/src/api/routers/roadmaps.py",
    '    stream_response = StreamingResponse(\n'
    '        forward_subscription(\n'
    '            subscription,\n'
    '            participant_id=event_ticket.participant_id,\n'
    '            close_at=event_ticket.session_expires_at,\n'
    '            is_still_authorized=_is_still_authorized,\n'
    '            is_participant_revoked_now=_is_revoked_fast,\n'
    '        ),\n',
    '    async def _bounded_stream():\n'
    '        try:\n'
    '            async for chunk in forward_subscription(\n'
    '                subscription,\n'
    '                participant_id=event_ticket.participant_id,\n'
    '                close_at=event_ticket.session_expires_at,\n'
    '                is_still_authorized=_is_still_authorized,\n'
    '                is_participant_revoked_now=_is_revoked_fast,\n'
    '            ):\n'
    '                yield chunk\n'
    '        finally:\n'
    '            await stream_lease.release()\n\n'
    '    stream_response = StreamingResponse(\n'
    '        _bounded_stream(),\n',
)

# ---------------------------------------------------------------------------
# SSE authorization and slow-consumer containment
# ---------------------------------------------------------------------------
replace(
    "apps/api/src/api/services/auth_service.py",
    '    result = await db.execute(\n'
    '        select(Participant).where(\n'
    '            Participant.roadmap_id == roadmap_id,\n'
    '            Participant.id == participant_id,\n'
    '        )\n'
    '    )\n'
    '    participant = result.scalar_one_or_none()\n'
    '    return participant is None or participant.revoked_at is not None\n',
    '    result = await db.execute(\n'
    '        select(Participant, Roadmap)\n'
    '        .join(Roadmap, Participant.roadmap_id == Roadmap.id)\n'
    '        .where(\n'
    '            Participant.roadmap_id == roadmap_id,\n'
    '            Participant.id == participant_id,\n'
    '        )\n'
    '    )\n'
    '    row = result.one_or_none()\n'
    '    if row is None:\n'
    '        return True\n'
    '    participant, roadmap = row\n'
    '    if participant.revoked_at is not None or roadmap.deleted_at is not None:\n'
    '        return True\n'
    '    if participant.session_expires_at is not None:\n'
    '        return ensure_aware_utc(participant.session_expires_at) <= datetime.now(timezone.utc)\n'
    '    return False\n',
)
replace(
    "apps/api/src/api/services/event_bus.py",
    'logger = logging.getLogger(__name__)\n_HEARTBEAT_INTERVAL_SECONDS = 25.0\n',
    'logger = logging.getLogger(__name__)\n_HEARTBEAT_INTERVAL_SECONDS = 25.0\n'
    '_MEMORY_SUBSCRIPTION_QUEUE_MAX = 256\n_OVERFLOW_SENTINEL = object()\n',
)
replace(
    "apps/api/src/api/services/event_bus.py",
    'def _is_own_revocation(event: Event, participant_id: str | None) -> bool:\n',
    'class SubscriptionOverflowError(RuntimeError):\n'
    '    """Raised when a slow in-memory SSE consumer exceeds its bounded queue."""\n\n\n'
    'def _is_own_revocation(event: Event, participant_id: str | None) -> bool:\n',
)
replace(
    "apps/api/src/api/services/event_bus.py",
    '            event = await subscription.get_event(timeout)\n',
    '            try:\n'
    '                event = await subscription.get_event(timeout)\n'
    '            except SubscriptionOverflowError:\n'
    '                logger.warning("Closed slow realtime consumer after queue overflow")\n'
    '                break\n',
)
replace(
    "apps/api/src/api/services/event_bus.py",
    '            if _is_own_revocation(event, participant_id):\n'
    '                yield event.to_sse()\n'
    '                break\n\n',
    '            if _is_own_revocation(event, participant_id):\n'
    '                yield event.to_sse()\n'
    '                break\n\n'
    '            if event.action == "roadmap.deleted":\n'
    '                # Deletion invalidates every participant session, but the\n'
    '                # terminal event is still delivered so clients can explain\n'
    '                # why the stream ended.\n'
    '                yield event.to_sse()\n'
    '                break\n\n',
)
replace(
    "apps/api/src/api/services/event_bus.py",
    '    async def get_event(self, timeout: float) -> Event | None:\n'
    '        try:\n'
    '            return await asyncio.wait_for(self._queue.get(), timeout=timeout)\n'
    '        except asyncio.TimeoutError:\n'
    '            return None\n',
    '    async def get_event(self, timeout: float) -> Event | None:\n'
    '        try:\n'
    '            item = await asyncio.wait_for(self._queue.get(), timeout=timeout)\n'
    '        except asyncio.TimeoutError:\n'
    '            return None\n'
    '        if item is _OVERFLOW_SENTINEL:\n'
    '            raise SubscriptionOverflowError\n'
    '        return item\n',
)
replace(
    "apps/api/src/api/services/event_bus.py",
    '    async def subscribe(self, roadmap_id: str) -> asyncio.Queue:\n'
    '        queue: asyncio.Queue = asyncio.Queue()\n',
    '    async def subscribe(self, roadmap_id: str) -> asyncio.Queue:\n'
    '        queue: asyncio.Queue = asyncio.Queue(maxsize=_MEMORY_SUBSCRIPTION_QUEUE_MAX)\n',
)
replace(
    "apps/api/src/api/services/event_bus.py",
    '        for queue in queues:\n'
    '            await queue.put(event)\n',
    '        for queue in queues:\n'
    '            try:\n'
    '                queue.put_nowait(event)\n'
    '            except asyncio.QueueFull:\n'
    '                await self.unsubscribe(event.roadmap_id, queue)\n'
    '                while not queue.empty():\n'
    '                    try:\n'
    '                        queue.get_nowait()\n'
    '                    except asyncio.QueueEmpty:\n'
    '                        break\n'
    '                queue.put_nowait(_OVERFLOW_SENTINEL)\n',
)

# ---------------------------------------------------------------------------
# Join/session amplification cap
# ---------------------------------------------------------------------------
replace(
    "apps/api/src/api/services/roadmap_join_service.py",
    'from sqlalchemy import select\n',
    'from sqlalchemy import func, or_, select\n',
)
replace(
    "apps/api/src/api/services/roadmap_join_service.py",
    'from api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink\n',
    'from api.config import get_settings\n'
    'from api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink\n'
    'from api.services.activity_log_limit import enforce_activity_log_cap\n',
)
replace(
    "apps/api/src/api/services/roadmap_join_service.py",
    '    now = datetime.now(timezone.utc)\n'
    '    share_link.last_used_at = now\n',
    '    # Serialize joins for this invite before applying the active-session cap.\n'
    '    locked_result = await db.execute(\n'
    '        select(ShareLink).where(ShareLink.id == share_link.id).with_for_update()\n'
    '    )\n'
    '    locked_share_link = locked_result.scalar_one_or_none()\n'
    '    if (\n'
    '        locked_share_link is None\n'
    '        or not locked_share_link.is_active\n'
    '        or locked_share_link.token_hash != token_hash\n'
    '    ):\n'
    '        raise HTTPException(status_code=401, detail="Invalid or expired invite token")\n'
    '    share_link = locked_share_link\n\n'
    '    now = datetime.now(timezone.utc)\n'
    '    active_sessions = await db.scalar(\n'
    '        select(func.count(Participant.id)).where(\n'
    '            Participant.share_link_id == share_link.id,\n'
    '            Participant.revoked_at.is_(None),\n'
    '            or_(\n'
    '                Participant.session_expires_at.is_(None),\n'
    '                Participant.session_expires_at > now,\n'
    '            ),\n'
    '        )\n'
    '    )\n'
    '    if int(active_sessions or 0) >= get_settings().max_active_sessions_per_share_link:\n'
    '        raise HTTPException(\n'
    '            status_code=429,\n'
    '            detail="Active session limit reached for this invite",\n'
    '        )\n'
    '    share_link.last_used_at = now\n',
)
replace(
    "apps/api/src/api/services/roadmap_join_service.py",
    '    await db.commit()\n',
    '    await enforce_activity_log_cap(db, roadmap.id)\n'
    '    await db.commit()\n',
)

# ---------------------------------------------------------------------------
# Activity log hard cap across every write service
# ---------------------------------------------------------------------------
for path, import_anchor, roadmap_expr in [
    (
        "apps/api/src/api/services/roadmap_service.py",
        "from api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink\n",
        "roadmap.id",
    ),
    (
        "apps/api/src/api/services/roadmap_task_service.py",
        "from api.models.roadmap import ActivityLog, Participant, Roadmap\n",
        "roadmap_id",
    ),
    (
        "apps/api/src/api/services/roadmap_tag_service.py",
        "from api.models.roadmap import ActivityLog, Participant, Roadmap\n",
        "roadmap.id",
    ),
    (
        "apps/api/src/api/services/sharing_service.py",
        "from api.models.roadmap import ActivityLog, Participant, ShareLink\n",
        "roadmap_id",
    ),
    (
        "apps/api/src/api/services/version_service.py",
        "from api.models.roadmap import ActivityLog, Participant, Roadmap, RoadmapVersion\n",
        "roadmap_id",
    ),
]:
    replace(
        path,
        import_anchor,
        import_anchor + "from api.services.activity_log_limit import enforce_activity_log_cap\n",
    )
    p = Path(path)
    text = p.read_text()
    commits = text.count("    await db.commit()\n")
    if commits == 0:
        raise SystemExit(f"{path}: no db commits found")
    text = text.replace(
        "    await db.commit()\n",
        f"    await enforce_activity_log_cap(db, {roadmap_expr})\n    await db.commit()\n",
    )
    p.write_text(text)

# join_service was handled separately above.

# ---------------------------------------------------------------------------
# Bounded total roadmap records and bounded version-history bytes
# ---------------------------------------------------------------------------
replace(
    "apps/api/src/api/services/roadmap_service.py",
    'import logging\n',
    'import logging\n\nimport sqlalchemy as sa\n',
)
replace(
    "apps/api/src/api/services/roadmap_service.py",
    'logger = logging.getLogger(__name__)\n',
    'logger = logging.getLogger(__name__)\n_SERVER_ROADMAP_CAPACITY_LOCK = 0x52464F52\n',
)
replace(
    "apps/api/src/api/services/roadmap_service.py",
    'async def create_roadmap(\n'
    '    db: AsyncSession,\n'
    '    payload: CreateRoadmapRequest,\n'
    '    web_base_url: str,\n'
    ') -> CreateRoadmapResponse:\n'
    '    validate_roadmap_domain(payload.phases, payload.tag_registry)\n',
    'async def create_roadmap(\n'
    '    db: AsyncSession,\n'
    '    payload: CreateRoadmapRequest,\n'
    '    web_base_url: str,\n'
    '    max_server_roadmaps: int,\n'
    ') -> CreateRoadmapResponse:\n'
    '    # PostgreSQL advisory lock makes the global record cap exact even when\n'
    '    # many anonymous create requests arrive concurrently. Soft-deleted rows\n'
    '    # deliberately continue to count until retention hard-purges them.\n'
    '    await db.execute(sa.select(sa.func.pg_advisory_xact_lock(_SERVER_ROADMAP_CAPACITY_LOCK)))\n'
    '    roadmap_count = await db.scalar(sa.select(sa.func.count(Roadmap.id)))\n'
    '    if int(roadmap_count or 0) >= max_server_roadmaps:\n'
    '        raise HTTPException(\n'
    '            status_code=503,\n'
    '            detail="Server roadmap capacity is temporarily unavailable",\n'
    '        )\n'
    '    validate_roadmap_domain(payload.phases, payload.tag_registry)\n',
)
replace(
    "apps/api/src/api/services/roadmap_service.py",
    'from fastapi import HTTPException\n',
    'from fastapi import HTTPException\n',
    count=0,
) if False else None
# Roadmap service already imports HTTPException indirectly? Add it if needed below.
p = Path("apps/api/src/api/services/roadmap_service.py")
text = p.read_text()
if "from fastapi import HTTPException\n" not in text:
    text = text.replace(
        "import sqlalchemy as sa\n",
        "import sqlalchemy as sa\nfrom fastapi import HTTPException\n",
        1,
    )
p.write_text(text)

replace(
    "apps/api/src/api/services/version_service.py",
    'import logging\n',
    'import logging\n\nimport sqlalchemy as sa\n',
)
replace(
    "apps/api/src/api/services/version_service.py",
    'from api.models.roadmap import ActivityLog, Participant, Roadmap, RoadmapVersion\n',
    'from api.config import get_settings\n'
    'from api.models.roadmap import ActivityLog, Participant, Roadmap, RoadmapVersion\n',
)
replace(
    "apps/api/src/api/services/version_service.py",
    'async def _trim_old_versions(db: AsyncSession, roadmap_id: str) -> None:\n'
    '    old_ids_result = await db.execute(\n'
    '        select(RoadmapVersion.id)\n'
    '        .where(RoadmapVersion.roadmap_id == roadmap_id)\n'
    '        .order_by(RoadmapVersion.version_number.desc())\n'
    '        .offset(_MAX_ROADMAP_VERSIONS)\n'
    '    )\n'
    '    old_ids = old_ids_result.scalars().all()\n'
    '    if old_ids:\n'
    '        await db.execute(delete(RoadmapVersion).where(RoadmapVersion.id.in_(old_ids)))\n',
    'async def _trim_old_versions(db: AsyncSession, roadmap_id: str) -> None:\n'
    '    rows_result = await db.execute(\n'
    '        select(\n'
    '            RoadmapVersion.id,\n'
    '            sa.func.pg_column_size(RoadmapVersion.snapshot_json),\n'
    '        )\n'
    '        .where(RoadmapVersion.roadmap_id == roadmap_id)\n'
    '        .order_by(RoadmapVersion.version_number.desc())\n'
    '    )\n'
    '    rows = rows_result.all()\n'
    '    byte_cap = get_settings().max_version_history_bytes_per_roadmap\n'
    '    total_bytes = 0\n'
    '    old_ids: list[str] = []\n'
    '    for index, (version_id, stored_bytes) in enumerate(rows):\n'
    '        size = int(stored_bytes or 0)\n'
    '        preserve = index < 3\n'
    '        if (\n'
    '            index >= _MAX_ROADMAP_VERSIONS\n'
    '            or (not preserve and total_bytes + size > byte_cap)\n'
    '        ):\n'
    '            old_ids.extend(row[0] for row in rows[index:])\n'
    '            break\n'
    '        total_bytes += size\n'
    '    if old_ids:\n'
    '        await db.execute(delete(RoadmapVersion).where(RoadmapVersion.id.in_(old_ids)))\n',
)

# ---------------------------------------------------------------------------
# Remove stale viewer-token wording and normalize generated invite base URL.
# ---------------------------------------------------------------------------
replace(
    "apps/api/src/api/services/token_service.py",
    '- Private owner/editor tokens and session tokens are stored only as SHA-256\n'
    '  hex digests; public viewer/demo tokens may be stored by the roadmap service\n'
    '  so owners can re-copy read-only links.\n',
    '- Invite tokens for every role and participant session tokens are stored only\n'
    '  as SHA-256 hex digests. Raw invite credentials are reveal-once on create/rotate.\n',
)
replace(
    "apps/api/src/api/services/sharing_service.py",
    '        url=f"{web_base_url}/join#token={raw_token}",\n',
    '        url=f"{web_base_url.rstrip(\'/\')}/join#token={raw_token}",\n',
)
replace(
    "apps/api/src/api/services/roadmap_service.py",
    '            url=f"{web_base_url}/join#token={raw}",\n',
    '            url=f"{web_base_url.rstrip(\'/\')}/join#token={raw}",\n',
)

# New stream-limit module should stay Ruff-clean.
replace(
    "apps/api/src/api/services/realtime_stream_limit.py",
    'import math\n',
    '',
)
