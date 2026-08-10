#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

uv_version="$(tr -d '[:space:]' < UV_VERSION)"
python -m pip install --disable-pip-version-check --quiet "uv==${uv_version}"

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
