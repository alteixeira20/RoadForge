from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI

from api.config import get_settings
from api.database import engine
from api.features.collaboration.lock_service import lock_service
from api.features.realtime.stream_limit import realtime_stream_registry
from api.features.realtime.ticket_service import ticket_service
from api.middleware.access_log import add_safe_access_log
from api.middleware.body_limit import add_body_limit
from api.middleware.browser_session import add_browser_session_auth
from api.middleware.cors import add_cors
from api.middleware.security_headers import add_security_headers
from api.routers import roadmaps
from api.shared.auth import browser_session_router as browser_sessions
from api.shared.health import router as health
from api.shared.realtime.event_bus import event_bus
from api.shared.realtime.startup import validate_realtime_connectivity
from api.shared.security.rate_limit_service import rate_limiter


@asynccontextmanager
async def _lifespan(_: FastAPI):
    async with AsyncExitStack() as resources:
        resources.push_async_callback(engine.dispose)
        for owner in (
            event_bus, rate_limiter, lock_service, ticket_service, realtime_stream_registry,
        ):
            resources.push_async_callback(owner.aclose)
        await validate_realtime_connectivity(get_settings())
        yield


def create_app() -> FastAPI:
    settings = get_settings()
    settings.validate_startup_security()
    settings.validate_startup_realtime()
    docs_url = "/api/docs" if settings.is_development else None
    redoc_url = "/api/redoc" if settings.is_development else None
    openapi_url = "/api/openapi.json" if settings.is_development else None
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
        lifespan=_lifespan,
    )
    add_cors(app)
    add_body_limit(app)
    add_browser_session_auth(app)
    add_security_headers(app)
    add_safe_access_log(app)
    app.include_router(health.router, prefix="/api")
    app.include_router(browser_sessions.router, prefix="/api/roadmaps")
    app.include_router(roadmaps.router, prefix="/api/roadmaps")
    return app


app = create_app()
