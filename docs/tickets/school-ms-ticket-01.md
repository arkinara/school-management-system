# 01. Infra: repo monorepo scaffold + tooling — pnpm workspaces, CI skeleton, lint config

## Description
This ticket bootstraps the repository structure for the School Management System per the locked tech stack: a pnpm-workspace monorepo containing a Next.js 14+ frontend, a FastAPI (uv-managed) backend, and a `docs/` directory holding the PRD. It also stands up a CI skeleton workflow and shared lint/format configuration so every subsequent ticket in Wave 1 and beyond has a working, consistent baseline to build on. This is developer-facing infrastructure with no end-user role.

## Reference
- PRD feature(s): N/A (infrastructure) — see Architecture & Tech Stack sections
- PRD sub-feature(s): N/A — sub-features below are ticket-scoped, not PRD sub-features
- PRD path: `docs/PRD.md` lines 93-135 (Architecture), 190-197 (Tech Stack)

## Sub-feature: Monorepo Workspace Setup
Covers creating the pnpm workspace root, the `frontend/`, `backend/`, and `docs/` top-level directories, and a root `.gitignore` covering both Node and Python build artifacts.

## Sub-feature: CI & Lint Baseline
Covers a CI skeleton workflow (install + lint + build-check jobs, no deploy step) and shared lint/format configuration for both the Next.js frontend and the FastAPI backend.

## Positive Acceptance Criteria

### Monorepo Workspace Setup
- [ ] `pnpm-workspace.yaml` at repo root declares `frontend` as a workspace package and `pnpm install` from repo root succeeds with no errors.
- [ ] `frontend/`, `backend/`, and `docs/` directories exist, with `docs/PRD.md` containing the finalized PRD content.
- [ ] `backend/pyproject.toml` is initialized for `uv` (Python 3.12) and `uv sync` succeeds from `backend/`.
- [ ] Root `.gitignore` excludes `node_modules/`, `.next/`, `__pycache__/`, `.venv/`, and `*.db` (SQLite dev files).

### CI & Lint Baseline
- [ ] CI workflow file (e.g. `.github/workflows/ci.yml`) runs on pull_request and push to main, with separate jobs for frontend and backend.
- [ ] Frontend job runs `pnpm install` then a lint step (ESLint + Prettier check) and exits 0 on a clean checkout.
- [ ] Backend job runs `uv sync` then a lint step (ruff or equivalent) and exits 0 on a clean checkout.
- [ ] Shared editor config (`.editorconfig`) is present and applies consistent indentation across `frontend/` and `backend/`.

## Negative Acceptance Criteria

### Monorepo Workspace Setup
- [ ] Running `pnpm install` from inside `backend/` (wrong directory) fails clearly rather than silently creating a stray `node_modules`.
- [ ] A missing or malformed `pyproject.toml` causes `uv sync` to fail with a non-zero exit code and a readable error, not a silent no-op.
- [ ] Committing a file matched by `.gitignore` (e.g. a `.db` file) is flagged by `git status` as ignored, confirming the ignore rules are active.

### CI & Lint Baseline
- [ ] A PR introducing a lint violation (e.g. unused import in frontend, or a ruff violation in backend) fails the corresponding CI job.
- [ ] CI workflow fails fast (does not proceed to a build step) when the install step fails.
- [ ] An empty or no-op CI run (no relevant files changed) still completes without erroring out due to missing directories.

## Tasks
1. Initialize git repo root with `.gitignore`, `.editorconfig`, and top-level `README.md` placeholder.
2. Create `pnpm-workspace.yaml` and scaffold `frontend/` with `pnpm create next-app` (TypeScript, App Router, Tailwind CSS).
3. Scaffold `backend/` with `uv init`, add FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 as declared dependencies (unused until ticket #2).
4. Add `docs/PRD.md` with the finalized PRD content.
5. Configure ESLint + Prettier for `frontend/` and ruff (or black+isort) for `backend/`, each with a `lint` script.
6. Write CI workflow skeleton with frontend and backend jobs (install + lint), no deploy/publish steps.
7. Verify a clean checkout passes CI end to end.

## Out of Scope
- Actual DB models, Alembic migrations, and auth/tenant middleware (ticket #2 covers this).
- Frontend auth pages and Better Auth wiring (ticket #4 covers this).
- Any deployment or production CI/CD pipeline (deferred to a future phase).

## Labels
`BE`, `FE`

## Estimate
M
