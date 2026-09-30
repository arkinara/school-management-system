# School Management System — Brief

## User
Wants a web-based, modular school management system aligned with Indonesian K-12 schools (TK → SMA). Designed so the system can be modularly extended to University later.

## Locked Tech Stack (carried from prior projects)
- Front End: Next.js + TypeScript + Tailwind + M3 + Better Auth
- Backend: FastAPI (Python) + SQLAlchemy or SQLModel + SQLite (dev) → Postgres later
- DB: SQLite for dev, Postgres-friendly schema
- Auth: Better Auth (FE) + JWT verification (BE) — multi-tenant via school_id claim

## Brief Answers (locked 2026-09-30)

### 1. Primary pain point — ALL of them
- Manual paper-based administration (absensi, rapor, jadwal) → digitalization
- Parent–school communication gap (no real-time info for orang tua)
- Multi-school / Yayasan coordination (one system across branches)
- SPP / tuition payment tracking & reminders
- Kurikulum Merdeka compliance + rapor format

### 2. Roles in v1 — ALL of them
- Kepala Sekolah / Principal
- Guru / Teacher (incl. Wali Kelas)
- Siswa / Student
- Orang Tua / Parent
- Tata Usaha / Admin staff
- Yayasan / Super-admin (multi-school owner)

### 3. Wave-1 MVP scope — F: All-in-one MVP
Every module in v1: master data, absensi, penilaian→rapor, jadwal, SPP/payment, plus parent communication channel.

### 4. Dashboard style — A: Role-based
Each role lands on a different home with role-specific widgets. Principal = school health; Guru = today's classes + pending grades; Siswa = today's schedule + assignments; Orang Tua = child's progress + payment status; TU = today's operations queue; Yayasan = multi-school overview.

### 5. Seed data shape — D: Per-jenjang isolated
Each education level (TK / SD / SMP / SMA) is its own independent tenant — easier to modular-extend to University later. Each tenant has its own kurikulum config, grade levels, and rules.

## Modular Scope Targets (Indonesia K-12)
- TK (Taman Kanak-Kanak): usia 4–6 tahun, no formal grades (semester rapor: tumbuh kembang)
- SD (Sekolah Dasar): grades 1–6, Kurikulum Merdeka
- SMP (Sekolah Menengah Pertama): grades 7–9, Kurikulum Merdeka
- SMA (Sekolah Menengah Atas): grades 10–12, Kurikulum Merdeka, penjurusan (IPA/IPS/Bahasa)
- University extension later — modular tenant module (different grading scale: A/B/C/D vs 1–100, SKS, semester system)

## Project Naming
Tentative: `arkinara/school-management-system` repo.
Project Board: `School Management System Board`.

## Workflow Cadence
FE-first, QA-gated, per-domain push. PM = Claude Sonnet 5. Dev = OpenCode + deepseek/deepseek-v4-flash (high). QA = OpenCode + MiniMax-M3.
