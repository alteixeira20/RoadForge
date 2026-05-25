.PHONY: help install dev diff api-up api-down api-reset api-migrate api-health web-start web-stop web-status start reset stop restart status logs logs-api logs-db logs-web audit audit-prod check deploy update migrate ps down doctor deploy-check deploy-hints

# ─── Configuration ────────────────────────────────────────────────────────────

WEB_PORT ?= 3020
WEB_HOST ?= localhost
WEB_URL  := http://localhost:$(WEB_PORT)
API_URL  := http://localhost:7878

APP_NAME ?= roadforge
DEPLOY_ROOT ?= /opt/stacks/roadforge
DATA_ROOT ?= /opt/data/apps/roadforge
ENV_FILE ?= $(DEPLOY_ROOT)/.env
COMPOSE_FILE ?= deploy/hosting-bay/compose.yaml
DEPLOY_COMPOSE := docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) --project-name $(APP_NAME)

# ─── Help ─────────────────────────────────────────────────────────────────────

help:
	@echo "RoadForge Development Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make install       Install frontend dependencies"
	@echo "  make dev           Run Next.js frontend in the foreground"
	@echo "  make check         Run linting, typechecking, and production build"
	@echo "  make diff          Show working tree status, diff stats, and full diff"
	@echo "  make audit         Run dependency security audit"
	@echo "  make audit-prod    Run dependency security audit (production only)"
	@echo ""
	@echo "Deployment (hosting-bay):"
	@echo "  make deploy        Build/start production stack and run migrations"
	@echo "  make update        Pull latest code, rebuild/restart stack, run migrations"
	@echo "  make migrate       Run production Alembic migrations"
	@echo "  make ps            Show production container status"
	@echo "  make logs          Follow production logs when $(ENV_FILE) exists; local logs otherwise"
	@echo "  make restart       Restart production stack when $(ENV_FILE) exists; local restart otherwise"
	@echo "  make down          Stop production stack without deleting volumes"
	@echo "  make doctor        Check production deployment prerequisites"
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
	NEXT_PUBLIC_API_URL=$(API_URL) pnpm --filter web dev --hostname $(WEB_HOST) --port $(WEB_PORT)

check:
	pnpm lint && pnpm typecheck && pnpm build

diff:
	@git status --short
	@git diff --stat -- $(DIFF_FILES)
	@git diff -- $(DIFF_FILES)
	@git ls-files --others --exclude-standard $(DIFF_FILES) | while read file; do \
		echo ""; \
		echo "Untracked: $$file"; \
		git diff --no-index /dev/null "$$file" || true; \
	done

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

restart:
	@if [ -f "$(ENV_FILE)" ]; then \
		echo "Restarting production $(APP_NAME) stack..."; \
		$(DEPLOY_COMPOSE) restart roadforge-postgres roadforge-api roadforge-web; \
		$(MAKE) ps; \
	else \
		$(MAKE) stop; \
		$(MAKE) start; \
	fi

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
		echo "Run 'make web-stop' to clean up stale frontend processes."; \
		exit 1; \
	fi
	@echo "Starting Web in background on $(WEB_URL)..."
	@echo "Using API: $(API_URL)"
	@setsid sh -c 'exec env NEXT_PUBLIC_API_URL=$(API_URL) pnpm --filter web dev --hostname $(WEB_HOST) --port $(WEB_PORT) > .logs/web.log 2>&1' & echo $$! > .pids/web.pid
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
	@STOPPED=0; \
	if [ -f .pids/web.pid ]; then \
		PID=$$(cat .pids/web.pid); \
		if kill -0 $$PID 2>/dev/null; then \
			echo "Stopping Web process group (PGID $$PID)..."; \
			kill -TERM -$$PID 2>/dev/null || kill -TERM $$PID; \
			sleep 2; \
			if kill -0 $$PID 2>/dev/null; then \
				echo "Process still alive, force killing..."; \
				kill -KILL -$$PID 2>/dev/null || kill -KILL $$PID; \
			fi; \
			STOPPED=1; \
		fi; \
		rm -f .pids/web.pid; \
	fi; \
	if lsof -ti :$(WEB_PORT) >/dev/null 2>&1; then \
		echo "Stopping stale process(es) listening on port $(WEB_PORT)..."; \
		lsof -ti :$(WEB_PORT) | xargs -r kill -TERM; \
		sleep 2; \
		if lsof -ti :$(WEB_PORT) >/dev/null 2>&1; then \
			lsof -ti :$(WEB_PORT) | xargs -r kill -KILL; \
		fi; \
		STOPPED=1; \
	fi; \
	if [ "$$STOPPED" = "1" ]; then echo "Web stopped."; else echo "Web is not running."; fi

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
	@if [ -f "$(ENV_FILE)" ]; then \
		$(DEPLOY_COMPOSE) logs --tail=100 -f; \
	else \
		echo "Following all logs (Ctrl+C to stop)..."; \
		tail -n 100 -F .logs/web.log 2>/dev/null & TAIL_PID=$$!; \
		docker compose logs -f api postgres & DC_PID=$$!; \
		trap "kill $$TAIL_PID $$DC_PID 2>/dev/null" INT TERM EXIT; \
		wait $$TAIL_PID $$DC_PID; \
	fi

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

# ─── Production Deployment (hosting-bay) ──────────────────────────────────────

deploy-check:
	@test -f "$(COMPOSE_FILE)" || (echo "Missing $(COMPOSE_FILE)" && exit 1)
	@test -f "$(ENV_FILE)" || (echo "Missing $(ENV_FILE). Copy deploy/hosting-bay/.env.example to $(ENV_FILE) and set POSTGRES_PASSWORD." && exit 1)
	@test -f "apps/web/Dockerfile" || (echo "Missing apps/web/Dockerfile" && exit 1)
	@test -f "apps/api/Dockerfile" || (echo "Missing apps/api/Dockerfile" && exit 1)

deploy: deploy-check
	@mkdir -p "$(DATA_ROOT)/postgres"
	$(DEPLOY_COMPOSE) build
	$(DEPLOY_COMPOSE) up -d
	$(MAKE) migrate
	$(MAKE) ps
	$(MAKE) deploy-hints

update:
	git pull --ff-only
	$(MAKE) deploy-check
	@mkdir -p "$(DATA_ROOT)/postgres"
	$(DEPLOY_COMPOSE) build
	$(DEPLOY_COMPOSE) up -d
	$(MAKE) migrate
	$(MAKE) ps
	$(MAKE) deploy-hints

migrate: deploy-check
	$(DEPLOY_COMPOSE) exec -T roadforge-api alembic upgrade head

ps: deploy-check
	$(DEPLOY_COMPOSE) ps

down: deploy-check
	$(DEPLOY_COMPOSE) down

doctor:
	@echo "RoadForge deployment doctor"
	@echo "APP_NAME=$(APP_NAME)"
	@echo "DEPLOY_ROOT=$(DEPLOY_ROOT)"
	@echo "DATA_ROOT=$(DATA_ROOT)"
	@echo "ENV_FILE=$(ENV_FILE)"
	@echo "COMPOSE_FILE=$(COMPOSE_FILE)"
	@test -f "$(COMPOSE_FILE)" && echo "OK: compose file exists" || echo "MISSING: $(COMPOSE_FILE)"
	@test -f "$(ENV_FILE)" && echo "OK: env file exists" || echo "MISSING: $(ENV_FILE)"
	@test -f "deploy/hosting-bay/nginx/roadforge.conf" && echo "OK: nginx config template exists" || echo "MISSING: nginx config template"
	@test -f "deploy/hosting-bay/cloudflared-ingress-snippet.yml" && echo "OK: cloudflared snippet exists" || echo "MISSING: cloudflared snippet"
	@docker network inspect edge >/dev/null 2>&1 && echo "OK: Docker network edge exists" || echo "MISSING: Docker network edge"

deploy-hints:
	@echo ""
	@echo "RoadForge production stack updated."
	@echo "Status: make ps"
	@echo "Logs:   make logs"
	@echo "Health: curl -s https://roadforge.alexandreteixeira.dev/api/health"
	@echo "Nginx config template: deploy/hosting-bay/nginx/roadforge.conf"
	@echo "Cloudflared snippet:   deploy/hosting-bay/cloudflared-ingress-snippet.yml"
