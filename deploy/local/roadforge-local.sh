#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
LOCAL_DIR="$ROOT_DIR/deploy/local"
COMPOSE_FILE="$LOCAL_DIR/compose.yaml"
ENV_FILE="$LOCAL_DIR/.env"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    cp "$LOCAL_DIR/.env.example" "$ENV_FILE"
    printf '%s\n' "Created $ENV_FILE from .env.example"
  fi
}

require_docker() {
  command -v docker >/dev/null 2>&1 || {
    printf '%s\n' 'docker is required' >&2
    exit 1
  }
  docker compose version >/dev/null 2>&1 || {
    printf '%s\n' 'docker compose is required' >&2
    exit 1
  }
}

install_runtime() {
  require_docker
  ensure_env
  compose config >/dev/null
  compose build
}

start_runtime() {
  require_docker
  ensure_env
  compose up -d
}

stop_runtime() {
  require_docker
  ensure_env
  compose stop
}

restart_runtime() {
  require_docker
  ensure_env
  compose restart
}

status_runtime() {
  require_docker
  ensure_env
  compose ps
}

doctor_runtime() {
  require_docker
  ensure_env
  compose config >/dev/null
  printf '%s\n' 'compose: valid'
  printf '%s\n' 'web: http://127.0.0.1:3020'
  printf '%s\n' 'api: http://127.0.0.1:7878/api/health'
  compose ps
}

logs_runtime() {
  require_docker
  ensure_env
  compose logs -f --tail=200
}

update_runtime() {
  require_docker
  ensure_env
  compose build --pull
  compose up -d --remove-orphans
}

usage() {
  cat <<'EOF'
Usage: sh deploy/local/roadforge-local.sh <command>

Commands:
  install   validate configuration and build images
  start     start the local runtime
  stop      stop containers without deleting state
  restart   restart the running services
  status    show service state and health
  doctor    validate Docker/Compose/config and show endpoints
  logs      follow recent service logs
  update    rebuild from the current checkout and apply non-destructively
EOF
}

case "${1:-}" in
  install) install_runtime ;;
  start) start_runtime ;;
  stop) stop_runtime ;;
  restart) restart_runtime ;;
  status) status_runtime ;;
  doctor) doctor_runtime ;;
  logs) logs_runtime ;;
  update) update_runtime ;;
  *) usage; exit 2 ;;
esac
