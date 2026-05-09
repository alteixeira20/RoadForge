from fastapi import FastAPI

from api.config import get_settings
from api.middleware.body_limit import add_body_limit
from api.middleware.cors import add_cors
from api.routers import health, roadmaps


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )
    add_cors(app)
    add_body_limit(app)
    app.include_router(health.router, prefix="/api")
    app.include_router(roadmaps.router, prefix="/api/roadmaps")
    return app


app = create_app()
