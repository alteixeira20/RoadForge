from contextlib import asynccontextmanager

from fastapi import FastAPI

from api.config import get_settings
from api.middleware.body_limit import add_body_limit
from api.middleware.cors import add_cors
from api.middleware.security_headers import add_security_headers
from api.routers import health, roadmaps
from api.services.realtime_startup import validate_realtime_connectivity


@asynccontextmanager
async def _lifespan(_: FastAPI):
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
    add_security_headers(app)
    app.include_router(health.router, prefix="/api")
    app.include_router(roadmaps.router, prefix="/api/roadmaps")
    return app


app = create_app()
