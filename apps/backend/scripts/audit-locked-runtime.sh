#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

bash scripts/sync-locked-env.sh audit

requirements="$(mktemp)"
trap 'rm -f "$requirements"' EXIT

uv export \
  --frozen \
  --offline \
  --no-dev \
  --no-emit-project \
  --no-header \
  --format requirements.txt \
  --output-file "$requirements"

uv run --no-sync pip-audit -r "$requirements"
