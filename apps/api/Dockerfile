FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ROADFORGE_API_WORKERS=1

WORKDIR /app

# The local package declares src/api as its wheel content, so source must be
# present before installation. Copying only pyproject.toml made clean builds
# attempt to install a package that did not exist in the image yet.
COPY pyproject.toml ./
COPY src/ ./src/
RUN python -m pip install --no-cache-dir --disable-pip-version-check .

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
