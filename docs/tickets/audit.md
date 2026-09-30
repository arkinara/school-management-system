# School Management System — Ticket Authoring Audit (Step 3A)

Total tickets: 38 | Repo: `arkinara/school-management-system` | Project: School Management System Board

Verifier result: **PASS** (all 38 bodies contain required sections; every declared sub-feature has matching AC headings with >=2 positive and >=2 negative criteria).


## Wave 1

### #1 — Infra: repo monorepo scaffold + tooling — pnpm workspaces, CI skeleton, lint config (#1)
- Labels: BE, FE | Deps: none | Estimate: M
  - Sub-feature: **Monorepo Workspace Setup** — AC: 4 positive / 3 negative
  - Sub-feature: **CI & Lint Baseline** — AC: 4 positive / 3 negative

### #2 — BE: shared scaffolding — SQLAlchemy models, Alembic migration, seed data, JWT + Better Auth verification, tenant scoping middleware (#2)
- Labels: BE, auth | Deps: [1] | Estimate: L
  - Sub-feature: **Data Model & Migrations** — AC: 4 positive / 3 negative
  - Sub-feature: **JWT Verification Middleware** — AC: 3 positive / 3 negative
  - Sub-feature: **Tenant/School Scoping Middleware** — AC: 3 positive / 3 negative

### #3 — BE: auth domain — POST /auth/register, /auth/login, /auth/logout, GET /auth/me, role guards (#3)
- Labels: BE, auth | Deps: [2] | Estimate: M
  - Sub-feature: **Credential Auth Endpoints** — AC: 4 positive / 3 negative
  - Sub-feature: **Role-based Access Control** — AC: 3 positive / 3 negative

### #4 — FE: Better Auth wiring — sign-in/sign-up pages + tenant-picker onboarding (#4)
- Labels: FE, auth | Deps: [3] | Estimate: M
  - Sub-feature: **Sign-in / Sign-up Pages** — AC: 4 positive / 3 negative
  - Sub-feature: **Tenant-picker Onboarding** — AC: 3 positive / 3 negative


## Wave 2

### #5 — BE: tenants + schools domain — CRUD scoped to Yayasan/super_admin (#5)
- Labels: BE, master-data | Deps: [2, 3] | Estimate: M
  - Sub-feature: **Tenant Creation** — AC: 4 positive / 3 negative
  - Sub-feature: **School Registration** — AC: 4 positive / 3 negative

### #6 — BE: users + roles + classes + subjects domain — CRUD scoped by role (#6)
- Labels: BE, master-data | Deps: [2, 3] | Estimate: L
  - Sub-feature: **Admin Assignment** — AC: 4 positive / 3 negative
  - Sub-feature: **Class & Subject Configuration** — AC: 4 positive / 3 negative
  - Sub-feature: **Teacher Management** — AC: 3 positive / 3 negative

### #7 — BE: students + parents linking domain — student record, parent assignment, sibling logic (#7)
- Labels: BE, master-data | Deps: [5, 6] | Estimate: M
  - Sub-feature: **Student Record Management** — AC: 4 positive / 3 negative
  - Sub-feature: **Parent/Guardian Linking & Sibling Logic** — AC: 4 positive / 3 negative

### #8 — FE: principal dashboard — school-wide KPI widgets + Yayasan school picker (#8)
- Labels: FE, dashboard | Deps: [4] | Estimate: M
  - Sub-feature: **Principal School-wide KPIs** — AC: 4 positive / 3 negative
  - Sub-feature: **Yayasan Quick School Picker (Shared Shell)** — AC: 3 positive / 3 negative

### #9 — FE: guru dashboard — today's classes, pending grade entry, attendance queue (#9)
- Labels: FE, dashboard | Deps: [4] | Estimate: M
  - Sub-feature: **Today's Classes Widget** — AC: 4 positive / 3 negative
  - Sub-feature: **Pending Grade Entry & Attendance Queue Widget** — AC: 3 positive / 3 negative


## Wave 3

### #10 — FE: siswa dashboard — today's schedule, assignments, rapor summary (#10)
- Labels: FE, dashboard | Deps: [4] | Estimate: M
  - Sub-feature: **Today's Schedule & Assignments Widget** — AC: 3 positive / 3 negative
  - Sub-feature: **Rapor Summary Widget** — AC: 3 positive / 3 negative

### #11 — FE: orang tua dashboard — child summary, payment status, recent announcements (#11)
- Labels: FE, dashboard | Deps: [4] | Estimate: M
  - Sub-feature: **Child Attendance/Grade Summary Widget** — AC: 3 positive / 3 negative
  - Sub-feature: **SPP Status & Announcements Widget** — AC: 3 positive / 3 negative

### #12 — FE: TU dashboard — today's operations queue, overdue SPP, billing tasks (#12)
- Labels: FE, dashboard | Deps: [4] | Estimate: M
  - Sub-feature: **Today's Operations Queue Widget** — AC: 3 positive / 3 negative
  - Sub-feature: **Overdue SPP & Billing Tasks Widget** — AC: 3 positive / 3 negative

### #13 — FE: yayasan dashboard — multi-tenant overview, school comparison, user counts (#13)
- Labels: FE, dashboard | Deps: [4] | Estimate: M
  - Sub-feature: **Multi-tenant/School Comparison Overview** — AC: 3 positive / 3 negative
  - Sub-feature: **Cross-school User & Enrollment Counts** — AC: 3 positive / 3 negative

### #14 — BE: absensi domain — POST /attendances, GET /attendances, parent notification trigger (#14)
- Labels: BE, absensi | Deps: [6, 7] | Estimate: L
  - Sub-feature: **Attendance Recording API** — AC: 5 positive / 4 negative
  - Sub-feature: **Attendance Notification Trigger** — AC: 4 positive / 3 negative
  - Sub-feature: **Attendance Recap Aggregation** — AC: 3 positive / 3 negative


## Wave 4

### #15 — FE: absensi input page — teacher UI per class per day (#15)
- Labels: FE, absensi | Deps: [9, 14] | Estimate: M
  - Sub-feature: **Class Roster Attendance Entry UI** — AC: 4 positive / 3 negative
  - Sub-feature: **Same-day Edit Window & Audit Flag** — AC: 3 positive / 3 negative

### #16 — BE: grades domain — POST /grades, GET /grades, aggregation (#16)
- Labels: BE, penilaian | Deps: [6, 7] | Estimate: L
  - Sub-feature: **Grade Entry by Category** — AC: 4 positive / 4 negative
  - Sub-feature: **Grade Aggregation View** — AC: 3 positive / 3 negative

### #17 — FE: grade entry page — teacher UI per class per subject per category (#17)
- Labels: FE, penilaian | Deps: [9, 16] | Estimate: M
  - Sub-feature: **Category-based Grade Entry UI** — AC: 4 positive / 4 negative
  - Sub-feature: **Bulk Entry Across Class Roster** — AC: 3 positive / 3 negative

### #18 — BE: rapor domain — compile grades + narrative, publish workflow, parent visibility (#18)
- Labels: BE, rapor | Deps: [14, 16] | Estimate: XL
  - Sub-feature: **Rapor Compilation** — AC: 4 positive / 3 negative
  - Sub-feature: **Review & Publish Workflow** — AC: 4 positive / 4 negative

### #19 — FE: rapor view page — parent + student view of published rapor per semester (#19)
- Labels: FE, rapor | Deps: [10, 11, 18] | Estimate: M
  - Sub-feature: **Published Rapor View (Parent)** — AC: 4 positive / 3 negative
  - Sub-feature: **Published Rapor View (Student)** — AC: 3 positive / 3 negative


## Wave 5

### #20 — BE: schedules domain — POST /schedules, GET /schedules, conflict detection (#20)
- Labels: BE, jadwal | Deps: [6, 7] | Estimate: L
  - Sub-feature: **Schedule CRUD API** — AC: 4 positive / 3 negative
  - Sub-feature: **Conflict Detection** — AC: 3 positive / 3 negative

### #21 — FE: jadwal config page — TU/admin UI for weekly schedule grid (#21)
- Labels: FE, jadwal | Deps: [12, 20] | Estimate: M
  - Sub-feature: **Weekly Schedule Grid Builder** — AC: 4 positive / 3 negative
  - Sub-feature: **Conflict Feedback UI** — AC: 3 positive / 3 negative

### #22 — FE: jadwal view page — per-role today's classes/schedule (#22)
- Labels: FE, jadwal | Deps: [9, 10, 20] | Estimate: M
  - Sub-feature: **Teacher Today/Week View** — AC: 3 positive / 3 negative
  - Sub-feature: **Student/Parent Today/Week View** — AC: 3 positive / 3 negative

### #23 — BE: SPP domain — bills CRUD, payments, overdue alerts (#23)
- Labels: BE, spp | Deps: [7] | Estimate: L
  - Sub-feature: **Bill Generation** — AC: 3 positive / 3 negative
  - Sub-feature: **Payment Recording** — AC: 3 positive / 3 negative
  - Sub-feature: **Overdue Tracking & Alerts** — AC: 3 positive / 3 negative

### #24 — FE: SPP bill generation page — TU creates monthly bills per class (#24)
- Labels: FE, spp | Deps: [12, 23] | Estimate: M
  - Sub-feature: **Single Bill Creation UI** — AC: 3 positive / 3 negative
  - Sub-feature: **Bulk Bill Generation UI** — AC: 3 positive / 3 negative

### #25 — FE: SPP payment recording page — TU records payments against bills (#25)
- Labels: FE, spp | Deps: [12, 23] | Estimate: M
  - Sub-feature: **Payment Recording Form** — AC: 3 positive / 3 negative
  - Sub-feature: **Receipt View/Print** — AC: 3 positive / 3 negative


## Wave 6

### #26 — BE: announcements + message threads domain (#26)
- Labels: BE, komunikasi | Deps: [5, 6] | Estimate: L
  - Sub-feature: **Announcement Board** — AC: 5 positive / 5 negative
  - Sub-feature: **Direct Message Threads** — AC: 5 positive / 5 negative

### #27 — FE: announcement board — broadcast UI for principal/TU; viewer for everyone (#27)
- Labels: FE, komunikasi | Deps: [8, 12, 26] | Estimate: M
  - Sub-feature: **Broadcast Composer (Staff)** — AC: 5 positive / 4 negative
  - Sub-feature: **Announcement Feed Viewer (All Roles)** — AC: 5 positive / 4 negative

### #28 — FE: direct message threads — parent <-> teacher chat-like UI (#28)
- Labels: FE, komunikasi | Deps: [9, 11, 26] | Estimate: M
  - Sub-feature: **Thread List & Compose** — AC: 5 positive / 4 negative
  - Sub-feature: **Message Read/Unread State** — AC: 4 positive / 4 negative

### #29 — FE: notification center — in-app bell, per-user feed (#29)
- Labels: FE, komunikasi | Deps: [8, 9, 10, 11, 12, 26] | Estimate: M
  - Sub-feature: **In-app Notification Bell** — AC: 4 positive / 4 negative
  - Sub-feature: **Per-user Notification Feed** — AC: 4 positive / 4 negative

### #30 — BE: audit log + cross-cutting observability — auth events, data mutations, tenant-boundary attempts (#30)
- Labels: BE, auth | Deps: [2, 3] | Estimate: M
  - Sub-feature: **Auth & Mutation Audit Events** — AC: 5 positive / 4 negative
  - Sub-feature: **Tenant-boundary Violation Logging** — AC: 4 positive / 4 negative


## Wave 7

### #31 — FE Wiring: principal dashboard → real APIs (#31)
- Labels: FE Wiring, dashboard | Deps: [8, 5, 6, 7] | Estimate: S
  - Sub-feature: **API Integration** — AC: 5 positive / 3 negative
  - Sub-feature: **Loading/Error/Empty States** — AC: 4 positive / 3 negative

### #32 — FE Wiring: guru dashboard → real APIs (#32)
- Labels: FE Wiring, dashboard | Deps: [9, 14, 16] | Estimate: S
  - Sub-feature: **API Integration** — AC: 5 positive / 3 negative
  - Sub-feature: **Loading/Error/Empty States** — AC: 4 positive / 3 negative

### #33 — FE Wiring: siswa dashboard → real APIs (#33)
- Labels: FE Wiring, dashboard | Deps: [10, 16, 18, 20] | Estimate: S
  - Sub-feature: **API Integration** — AC: 5 positive / 3 negative
  - Sub-feature: **Loading/Error/Empty States** — AC: 4 positive / 3 negative

### #34 — FE Wiring: orang tua dashboard → real APIs (#34)
- Labels: FE Wiring, dashboard | Deps: [11, 14, 18, 23] | Estimate: S
  - Sub-feature: **API Integration** — AC: 5 positive / 3 negative
  - Sub-feature: **Loading/Error/Empty States** — AC: 4 positive / 3 negative

### #35 — FE Wiring: TU dashboard → real APIs (#35)
- Labels: FE Wiring, dashboard | Deps: [12, 23] | Estimate: S
  - Sub-feature: **API Integration** — AC: 5 positive / 3 negative
  - Sub-feature: **Loading/Error/Empty States** — AC: 4 positive / 3 negative

### #36 — FE Wiring: absensi page → real APIs (#36)
- Labels: FE Wiring, absensi | Deps: [15, 14] | Estimate: S
  - Sub-feature: **API Integration** — AC: 5 positive / 3 negative
  - Sub-feature: **Loading/Error/Empty States** — AC: 4 positive / 3 negative

### #37 — FE Wiring: rapor view → real APIs (#37)
- Labels: FE Wiring, rapor | Deps: [19, 18] | Estimate: S
  - Sub-feature: **API Integration** — AC: 5 positive / 3 negative
  - Sub-feature: **Loading/Error/Empty States** — AC: 4 positive / 3 negative

### #38 — FE Wiring: SPP pages → real APIs (#38)
- Labels: FE Wiring, spp | Deps: [24, 25, 23] | Estimate: M
  - Sub-feature: **Bill Generation API Integration** — AC: 4 positive / 3 negative
  - Sub-feature: **Payment Recording API Integration** — AC: 4 positive / 3 negative
