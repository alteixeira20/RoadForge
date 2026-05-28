FROM python:3.12-slim

# Install uv from the official image (avoids pip overhead)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Copy metadata first — dependency install is cached separately from source changes
COPY pyproject.toml .

# Install runtime dependencies listed in pyproject.toml
RUN uv pip install --system --no-cache \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.34" \
    "sqlalchemy[asyncio]>=2.0" \
    "asyncpg>=0.30" \
    "alembic>=1.14" \
    "pydantic>=2.10" \
    "pydantic-settings>=2.7" \
    "python-dotenv>=1.0" \
    "redis>=5.0"

# Copy Alembic config and migration scripts
COPY alembic.ini .
COPY alembic/ alembic/

# Copy application source
COPY src/ src/

# src/ is on the Python path so `import api` resolves to src/api/
ENV PYTHONPATH=/app/src
ENV ROADFORGE_API_WORKERS=1

EXPOSE 7878

# Multi-worker mode is allowed only with Redis-backed realtime state. Keep the
# default single-worker path safe for local development and memory backend use.
CMD ["sh", "-c", "if [ \"${ROADFORGE_API_WORKERS:-1}\" != \"1\" ] && [ \"${ROADFORGE_REALTIME_BACKEND:-memory}\" != \"redis\" ]; then echo >&2 \"Refusing to start ROADFORGE_API_WORKERS=${ROADFORGE_API_WORKERS:-1} with ROADFORGE_REALTIME_BACKEND=${ROADFORGE_REALTIME_BACKEND:-memory}; multi-worker mode requires ROADFORGE_REALTIME_BACKEND=redis.\"; exit 1; fi; exec uvicorn api.main:app --host 0.0.0.0 --port 7878 --workers \"${ROADFORGE_API_WORKERS:-1}\""]
