#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

uv_version="$(tr -d '[:space:]' < UV_VERSION)"
if [[ -z "$uv_version" ]]; then
  echo "UV_VERSION is empty" >&2
  exit 1
fi

python -m pip install --disable-pip-version-check --quiet "uv==${uv_version}"
uv lock --check

sync_args=(sync --frozen)
for extra in "$@"; do
  sync_args+=(--extra "$extra")
done

uv "${sync_args[@]}"
