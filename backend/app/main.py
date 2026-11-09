from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import admin, ai_routes, auth, dashboards, donations, projects, purchases, vendors
from app.config import settings
from app.database import engine
from app.models import Base

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Prototype convenience. Production deployments should use versioned migrations.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    lifespan=lifespan,
    title="TrustFlow API",
    description=(
        "Purpose-restricted donation and financial accountability platform. "
        "All donations and vendor settlements in this prototype are SIMULATED."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(donations.router)
app.include_router(purchases.router)
app.include_router(vendors.router)
app.include_router(dashboards.router)
app.include_router(admin.router)
app.include_router(ai_routes.router)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "ai_provider_configured": settings.ai_enabled,
        "payments": "simulated",
        "notice": "Simulated restricted balances and vendor settlement. No real money moves in this prototype.",
    }


_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _DIST.is_dir():
    assets_dir = _DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = _DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")
