# School Management System API

FastAPI backend (Python 3.12, uv-managed). Part of the `school-ms` monorepo.

```bash
uv sync
uv run uvicorn app.main:app --reload
```

Health probe: `GET /api/health` → `{"status":"ok"}`.
