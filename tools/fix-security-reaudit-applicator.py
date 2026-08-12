from pathlib import Path

path = Path("tools/apply-security-reaudit.py")
text = path.read_text()
start_marker = '''replace(
    "apps/api/src/api/services/roadmap_service.py",
    'async def create_roadmap('''
end_marker = '''replace(
    "apps/api/src/api/services/roadmap_service.py",
    'from fastapi import HTTPException\\n','''
start = text.index(start_marker)
end = text.index(end_marker, start)
replacement = r'''replace(
    "apps/api/src/api/services/roadmap_service.py",
    'async def create_roadmap(\n'
    '    db: AsyncSession,\n'
    '    payload: CreateRoadmapRequest,\n'
    '    web_base_url: str,\n'
    ') -> CreateRoadmapResponse:\n',
    'async def create_roadmap(\n'
    '    db: AsyncSession,\n'
    '    payload: CreateRoadmapRequest,\n'
    '    web_base_url: str,\n'
    '    max_server_roadmaps: int,\n'
    ') -> CreateRoadmapResponse:\n',
)
replace(
    "apps/api/src/api/services/roadmap_service.py",
    '    validate_roadmap_domain(payload.phases, payload.tag_registry)\n',
    '    # PostgreSQL advisory lock makes the global record cap exact even when\n'
    '    # many anonymous create requests arrive concurrently. Soft-deleted rows\n'
    '    # deliberately continue to count until retention hard-purges them.\n'
    '    await db.execute(\n'
    '        sa.select(sa.func.pg_advisory_xact_lock(_SERVER_ROADMAP_CAPACITY_LOCK))\n'
    '    )\n'
    '    roadmap_count = await db.scalar(sa.select(sa.func.count(Roadmap.id)))\n'
    '    if int(roadmap_count or 0) >= max_server_roadmaps:\n'
    '        raise HTTPException(\n'
    '            status_code=503,\n'
    '            detail="Server roadmap capacity is temporarily unavailable",\n'
    '        )\n'
    '    validate_roadmap_domain(payload.phases, payload.tag_registry)\n',
)
'''
path.write_text(text[:start] + replacement + text[end:])
