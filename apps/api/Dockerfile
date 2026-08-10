FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ROADFORGE_API_WORKERS=1 \
    PATH="/app/.venv/bin:${PATH}"

WORKDIR /app

# Pin the lock-maintenance tool independently from the application dependency
# graph. The first sync installs only third-party runtime dependencies so Docker
# can cache that layer; the second sync validates the lock against the complete
# project and installs RoadForge non-editably into the same virtual environment.
COPY UV_VERSION pyproject.toml uv.lock ./
RUN python -m pip install --no-cache-dir --disable-pip-version-check "uv==$(cat UV_VERSION)" \
    && uv lock --check \
    && uv sync --frozen --no-dev --no-install-project

COPY src/ ./src/
RUN uv sync --locked --no-dev --no-editable

COPY alembic.ini ./
COPY alembic/ ./alembic/

# Keep runtime writes and accidental package modification away from root.
RUN addgroup --system roadforge \
    && adduser --system --ingroup roadforge --home /app roadforge \
    && chown -R roadforge:roadforge /app
USER roadforge

EXPOSE 7878

# Multi-worker mode is allowed only with Redis-backed realtime state. Keep the
# default single-worker path safe for local development and memory backend use.
CMD ["sh", "-c", "if [ \"${ROADFORGE_API_WORKERS:-1}\" != \"1\" ] && [ \"${ROADFORGE_REALTIME_BACKEND:-memory}\" != \"redis\" ]; then echo >&2 \"Refusing to start ROADFORGE_API_WORKERS=${ROADFORGE_API_WORKERS:-1} with ROADFORGE_REALTIME_BACKEND=${ROADFORGE_REALTIME_BACKEND:-memory}; multi-worker mode requires ROADFORGE_REALTIME_BACKEND=redis.\"; exit 1; fi; exec uvicorn api.main:app --host 0.0.0.0 --port 7878 --workers \"${ROADFORGE_API_WORKERS:-1}\""]
