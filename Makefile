.PHONY: help install dev api-up api-down api-reset api-migrate api-health web-start web-stop web-status start reset stop restart status logs logs-api logs-db logs-web audit audit-prod check

# ─── Configuration ────────────────────────────────────────────────────────────

WEB_PORT ?= 3020
WEB_HOST ?= 127.0.0.1
WEB_URL  := http://localhost:$(WEB_PORT)
API_URL  := http://localhost:7878

# ─── Help ─────────────────────────────────────────────────────────────────────

help:
	@echo "RoadForge Development Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make install       Install frontend dependencies"
	@echo "  make dev           Run Next.js frontend in the foreground"
	@echo "  make check         Run linting, typechecking, and production build"
	@echo "  make audit         Run dependency security audit"
	@echo "  make audit-prod    Run dependency security audit (production only)"
	@echo ""
	@echo "  make start         Start all services (API in Docker, Web in background)"
	@echo "  make stop          Stop all services"
	@echo "  make restart       Stop and then start all services"
	@echo "  make status        Show status of all services"
	@echo "  make logs          Follow all logs (API, Postgres, Web)"
	@echo "  make reset         Destructive reset: wipe DB and start fresh"
	@echo ""
	@echo "  make api-up        Start Postgres and FastAPI in Docker"
	@echo "  make api-down      Stop backend services"
	@echo "  make api-reset     Complete backend reset: down, up, migrate, health"
	@echo "  make api-migrate   Run database migrations"
	@echo "  make api-health    Check if backend is reachable"
	@echo ""
	@echo "  make web-start     Start frontend in the background"
	@echo "  make web-stop      Stop background frontend process"
	@echo "  make web-status    Check if background frontend is running"
	@echo ""
	@echo "  make logs-api      Follow API logs"
	@echo "  make logs-db       Follow Postgres logs"
	@echo "  make logs-web      Follow Web logs"

# ─── Setup ────────────────────────────────────────────────────────────────────

install:
	pnpm install

# ─── Foreground Development ───────────────────────────────────────────────────

dev:
	pnpm --filter web dev --hostname $(WEB_HOST) --port $(WEB_PORT)

check:
	pnpm lint && pnpm typecheck && pnpm build

audit:
	pnpm audit

audit-prod:
	pnpm audit --prod

# ─── App Lifecycle ────────────────────────────────────────────────────────────

start: api-up api-migrate api-health web-start
	@echo ""
	@echo "RoadForge is running:"
	@echo "Frontend: $(WEB_URL)"
	@echo "API:      $(API_URL)"
	@echo ""
	@echo "View logs with: make logs"

stop: web-stop api-down

restart: stop start

reset: web-stop
	@echo "Resetting database..."
	docker compose down -v
	$(MAKE) start
	@echo ""
	@echo "WARNING: Database was reset to a clean state."

status:
	@echo "--- Docker Services ---"
	docker compose ps
	@echo ""
	@echo "--- API Health ---"
	@$(MAKE) api-health || echo "API is down"
	@echo ""
	@echo "--- Web Service ---"
	@$(MAKE) web-status

# ─── Backend (Docker) ──────────────────────────────────────────────────────────

api-up:
	docker compose up --build -d postgres api

api-down:
	docker compose down

api-migrate:
	docker compose exec api alembic upgrade head

api-health:
	@curl -s $(API_URL)/api/health | python3 -m json.tool || curl -s $(API_URL)/api/health

api-reset: api-down
	docker compose down -v
	$(MAKE) api-up
	@echo "Waiting for backend..."
	@sleep 5
	$(MAKE) api-migrate
	$(MAKE) api-health

# ─── Web (Background Process) ─────────────────────────────────────────────────

web-start:
	@mkdir -p .logs .pids
	@if [ -f .pids/web.pid ] && kill -0 $$(cat .pids/web.pid) 2>/dev/null; then \
		echo "Web is already running (PID $$(cat .pids/web.pid))"; \
		exit 1; \
	fi
	@if lsof -i :$(WEB_PORT) >/dev/null 2>&1; then \
		echo "Error: Port $(WEB_PORT) is already in use."; \
		lsof -i :$(WEB_PORT); \
		exit 1; \
	fi
	@echo "Starting Web in background on port $(WEB_PORT)..."
	@setsid sh -c 'exec pnpm --filter web dev --hostname $(WEB_HOST) --port $(WEB_PORT) > .logs/web.log 2>&1' & echo $$! > .pids/web.pid
	@sleep 2
	@if kill -0 $$(cat .pids/web.pid) 2>/dev/null; then \
		echo "Web started (PID $$(cat .pids/web.pid))"; \
		echo "URL: $(WEB_URL)"; \
	else \
		echo "Web failed to start. Check .logs/web.log"; \
		rm -f .pids/web.pid; \
		exit 1; \
	fi

web-stop:
	@if [ -f .pids/web.pid ]; then \
		PID=$$(cat .pids/web.pid); \
		if kill -0 $$PID 2>/dev/null; then \
			echo "Stopping Web process group (PGID $$PID)..."; \
			kill -TERM -$$PID 2>/dev/null || kill -TERM $$PID; \
			sleep 2; \
			if kill -0 $$PID 2>/dev/null; then \
				echo "Process still alive, force killing..."; \
				kill -KILL -$$PID 2>/dev/null || kill -KILL $$PID; \
			fi; \
		fi; \
		rm -f .pids/web.pid; \
		echo "Web stopped."; \
	else \
		echo "Web is not running (no PID file)."; \
	fi

web-status:
	@if [ -f .pids/web.pid ] && kill -0 $$(cat .pids/web.pid) 2>/dev/null; then \
		echo "Web: Running (PID $$(cat .pids/web.pid))"; \
		echo "URL: $(WEB_URL)"; \
		echo "Log: .logs/web.log"; \
	else \
		echo "Web: Stopped"; \
	fi

# ─── Logs ──────────────────────────────────────────────────────────────────────

logs:
	@echo "Following all logs (Ctrl+C to stop)..."
	@tail -n 100 -F .logs/web.log 2>/dev/null & TAIL_PID=$$!; \
	docker compose logs -f api postgres & DC_PID=$$!; \
	trap "kill $$TAIL_PID $$DC_PID 2>/dev/null" INT TERM EXIT; \
	wait $$TAIL_PID $$DC_PID

logs-api:
	docker compose logs --tail=100 -f api

logs-db:
	docker compose logs --tail=100 -f postgres

logs-web:
	@if [ -f .logs/web.log ]; then \
		tail -n 100 -f .logs/web.log; \
	else \
		echo "Frontend log not found; run 'make web-start' first."; \
	fi

