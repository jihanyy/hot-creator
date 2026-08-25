from pathlib import Path

from fastapi.staticfiles import StaticFiles

from .main import app


FRONTEND_DIST = Path(__file__).resolve().parent.parent / "dist"

if not FRONTEND_DIST.is_dir():
    raise RuntimeError(
        "Frontend build directory is missing. Build the image with the project Dockerfile."
    )

# API routes are registered by backend.main before this root mount, so /api/*
# continues to reach FastAPI while all frontend assets are served on one origin.
app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
