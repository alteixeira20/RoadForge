#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

uv_version="$(tr -d '[:space:]' < UV_VERSION)"
if [[ -z "$uv_version" ]]; then
  echo "UV_VERSION is empty" >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1 || [[ "$(uv --version 2>/dev/null | awk '{print $2}')" != "${uv_version}"* ]]; then
  if command -v python3 >/dev/null 2>&1; then
    python3 -m pip install --disable-pip-version-check --quiet "uv==${uv_version}" 2>/dev/null || true
  elif command -v python >/dev/null 2>&1; then
    python -m pip install --disable-pip-version-check --quiet "uv==${uv_version}" 2>/dev/null || true
  fi
fi
uv lock --check

sync_args=(sync --frozen)
for extra in "$@"; do
  sync_args+=(--extra "$extra")
done

uv "${sync_args[@]}"
