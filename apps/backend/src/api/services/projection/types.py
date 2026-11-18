from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class ProjectionParityResult:
    ok: bool
    phase_count_snapshot: int
    phase_count_projection: int
    task_count_snapshot: int
    task_count_projection: int
    issues: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ProjectionDriftFinding:
    roadmap_id: str
    ok: bool
    issue_count: int
    issues: list[str] = field(default_factory=list)
    phase_count_snapshot: int = 0
    phase_count_projection: int = 0
    task_count_snapshot: int = 0
    task_count_projection: int = 0


@dataclass(slots=True)
class ProjectionDriftReport:
    checked_count: int
    successful_parity_count: int
    drift_count: int
    findings: list[ProjectionDriftFinding] = field(default_factory=list)

    @property
    def safe_to_enable_projection_reads(self) -> bool:
        return self.drift_count == 0


@dataclass(slots=True)
class ProjectionBackfillResult:
    backfilled_count: int
    drift_report: ProjectionDriftReport | None = None
