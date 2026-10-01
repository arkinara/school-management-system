# School Management System

Modular, multi-tenant school management system for Indonesian K-12 (TK → SMA), designed to extend to University.

## Roles

Kepala Sekolah (Principal), Guru (Teacher / Wali Kelas), Siswa (Student), Orang Tua (Parent), Tata Usaha (Admin Staff), Yayasan (Super Admin).

## Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Material Design 3 tokens, Better Auth, lucide-react
- **Backend**: FastAPI (Python 3.12), SQLAlchemy 2.0, Alembic, Pydantic v2, SQLite (dev) → Postgres-compatible
- **Multi-tenant**: per-jenjang isolation (TK / SD / SMP / SMA / University)
- **Project management**: GitHub Project Board (School Management System Board #17, 4 lanes)

## Repository Layout

```
.
├── frontend/           Next.js app (component library + scaffold coming in Wave 1)
│   ├── tailwind.config.ts        M3 tokens wired
│   ├── src/app/globals.css       light + dark + prefers-reduced-motion
│   └── src/components/ui/        16 M3 components + Button + cn + stories + README
├── prototype/          Initial HTML prototype (UX phase 1)
│   ├── index.html                tab bar + viewport toggle + iframe + dark toggle
│   └── pages/                    11 pages (auth + 6 role dashboards + 4 paginated)
├── prototype-promax/    CANONICAL design + behavioural baseline (UX phase 2)
│   ├── README.md                 design system spec
│   ├── index.html                viewer shell with role tabs, viewport switcher, deep links
│   ├── assets/theme.css          design tokens (HSL, Fira Sans/Code, semantic ramp)
│   ├── assets/tw-config.js       Tailwind CDN config — every colour → token
│   ├── assets/app.js             runtime: icons, charts, command palette, toasts
│   └── pages/                    11 pages, denser 8/10 layout, data-dense operations dashboard
├── docs/               PRD, brief, tickets, screenshots
│   ├── BRIEF.md
│   ├── PRD.md                    matches SpendFlow shape, 393 blocks, 113 ACs
│   ├── PM-PHASE-SUMMARY.md
│   ├── notion/                   Notion publish sidecars (v1/v2/v3)
│   ├── screenshots/              UX phase 1 prototype screenshots (Desktop 1440)
│   ├── screenshots-promax/       UX phase 2 prototype screenshots (Desktop 1440)
│   └── tickets/                  38 ticket bodies + index + audit + promax-audit
├── scripts/            Workflow helpers (move-board, push-via-pat, pipeline, etc.)
└── README.md           you are here
```

## Wave Plan

| Wave | Tickets | Scope |
|---|---|---|
| 1 | #1–#4 | Repo scaffold, BE shared scaffolding, BE auth domain, FE auth wiring |
| 2 | #5–#9 | Tenants/schools + users/classes/subjects + students/parents + principal/guru dashboards |
| 3 | #10–#14 | Siswa / orang tua / TU / yayasan dashboards + BE absensi |
| 4 | #15–#19 | FE absensi + BE grades + FE grade entry + BE rapor + FE rapor view |
| 5 | #20–#25 | BE schedules + FE jadwal config + FE jadwal view + BE SPP + FE SPP pages |
| 6 | #26–#30 | BE komunikasi + FE announcement board + FE messages + FE notifications + BE audit log |
| 7 | #31–#38 | FE Wiring: each page → real APIs |

38 tickets total. See `docs/tickets/index.json`.

## Prototype Preview

Two prototypes shipped; **promax is the canonical baseline** (data-dense, behaviorally complete).

```bash
# Canonical
cd prototype-promax
python3 -m http.server 8765
# open http://localhost:8765/index.html

# Initial draft (kept for comparison)
cd prototype
python3 -m http.server 8766
# open http://localhost:8766/index.html
```

Tabs: Principal · Guru · Siswa · Orang Tua · TU · Yayasan · Auth · Form Patterns

Viewports: Mobile 375 · Tablet 768 · Desktop 1440 · Full

Per-ticket design references live in `docs/tickets/school-ms-ticket-*.md` `## Design Baseline` (FE build tickets) or `## Behavioural Reference` (FE Wiring tickets). All FE tickets point at `prototype-promax/`.

## Reference PRD (SpendFlow format)

The PRD at `docs/PRD.md` follows the locked SpendFlow shape (per the user's 2026-09-30 reference): `## Feature:` → `### Goal` + `### Definition of Done` (to_do checkboxes), `## Sub-feature:` blocks, plus mermaid `sequenceDiagram` in Architecture and `erDiagram` in Database Schema.

Published Notion page: `3eb8f6b0-a7a5-81db-9834-d74fe641de37`.

## Status

PM phase complete. UX phase complete (component library + prototype viewer + 11 page mockups). Dev cycle queued for Wave 1 tickets.