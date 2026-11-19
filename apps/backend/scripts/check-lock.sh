#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

uv_version="$(tr -d '[:space:]' < UV_VERSION)"
if ! command -v uv >/dev/null 2>&1 || [[ "$(uv --version 2>/dev/null | awk '{print $2}')" != "${uv_version}"* ]]; then
  if command -v python3 >/dev/null 2>&1; then
    python3 -m pip install --disable-pip-version-check --quiet "uv==${uv_version}" 2>/dev/null || true
  elif command -v python >/dev/null 2>&1; then
    python -m pip install --disable-pip-version-check --quiet "uv==${uv_version}" 2>/dev/null || true
  fi
fi

uv lock --check

first="$(mktemp)"
second="$(mktemp)"
trap 'rm -f "$first" "$second"' EXIT

export_args=(
  export
  --frozen
  --offline
  --no-dev
  --no-emit-project
  --no-header
  --format requirements.txt
)

uv "${export_args[@]}" --output-file "$first"
uv "${export_args[@]}" --output-file "$second"
cmp "$first" "$second"

echo "uv.lock matches pyproject.toml and produces a deterministic offline runtime export."
