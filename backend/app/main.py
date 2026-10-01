"""School Management System API entrypoint."""

from fastapi import FastAPI

app = FastAPI(
    title="School Management System API",
    version="0.1.0",
)


@app.get("/")
def root() -> dict[str, str]:
    """Service identity probe."""
    return {"name": "School Management System API", "version": "0.1.0"}


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness probe used by CI and load balancers."""
    return {"status": "ok"}
