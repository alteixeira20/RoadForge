.PHONY: help install dev api-up api-down api-reset api-migrate api-health check manual-start logs-api logs-db

# ─── Help ─────────────────────────────────────────────────────────────────────

help:
	@echo "RoadForge Development Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make install       Install frontend dependencies"
	@echo "  make dev           Run Next.js frontend in development mode"
	@echo "  make check         Run linting, typechecking, and production build"
	@echo ""
	@echo "  make api-up        Start Postgres and FastAPI in Docker"
	@echo "  make api-down      Stop backend services"
	@echo "  make api-reset     Complete backend reset: down, up, migrate, health"
	@echo "  make api-migrate   Run database migrations"
	@echo "  make api-health    Check if backend is reachable"
	@echo ""
	@echo "  make manual-start  Shortcut to reset backend and prepare for testing"
	@echo "  make logs-api      Tail API logs (last 80 lines)"
	@echo "  make logs-db       Tail Postgres logs (last 80 lines)"

# ─── Frontend ──────────────────────────────────────────────────────────────────

install:
	pnpm install

dev:
	pnpm dev

check:
	cd apps/web && pnpm lint && pnpm typecheck && pnpm build

# ─── Backend (Docker) ──────────────────────────────────────────────────────────

api-up:
	docker compose up --build -d postgres api

api-down:
	docker compose down

api-migrate:
	docker compose exec api alembic upgrade head

api-health:
	@curl -s http://localhost:7878/api/health | python3 -m json.tool || curl -s http://localhost:7878/api/health || echo "API unreachable"

api-reset: api-down
	docker compose down -v
	$(MAKE) api-up
	@echo "Waiting for backend..."
	@sleep 5
	$(MAKE) api-migrate
	$(MAKE) api-health

manual-start: api-reset
	@echo ""
	@echo "Done! Backend is ready."
	@echo "Now run 'make dev' in a separate terminal to start the frontend."

# ─── Logs ──────────────────────────────────────────────────────────────────────

logs-api:
	docker compose logs --tail=80 api

logs-db:
	docker compose logs --tail=80 postgres
