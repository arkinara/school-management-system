# 16. BE: grades domain — POST /grades, GET /grades, aggregation

## Description
Implements the backend grade-book domain that teachers write to and that rapor compilation later reads from. Covers category-tagged grade entry (formatif/sumatif/PR/tugas) with jenjang-aware validation, and an aggregation endpoint that rolls scores up by student/subject/category/semester for wali kelas and principal review. This is the data source consumed directly by ticket #17 (FE grade entry, wired live) and later by ticket #18 (rapor compilation).

## Reference
- PRD feature(s): Penilaian / Grade Book
- PRD sub-feature(s): Grade Entry by Category (BE portion), Grade Aggregation View (BE portion)
- PRD path: `docs/PRD.md` lines 397-431

## Sub-feature: Grade Entry by Category
POST /grades accepts a formatif/sumatif/PR/tugas category tag, a 0-100 score, and a descriptive note that is required for TK/SD and optional for SMP/SMA, scoped to a semester and the tenant's active kurikulum_version.

## Sub-feature: Grade Aggregation View
GET /grades?student_id=&semester= returns grade data aggregated/grouped by student, subject, category, and semester, and flags entries that are missing or incomplete ahead of rapor compilation.

## Positive Acceptance Criteria

### Grade Entry by Category
- [ ] POST /grades with a valid formatif/sumatif/PR/tugas category, score 0-100, student_id, subject_id, and semester persists a new grade record scoped to the tenant's kurikulum_version.
- [ ] POST /grades for a TK or SD tenant with a descriptive note succeeds and stores the note alongside the score.
- [ ] POST /grades for an SMP or SMA tenant with no note provided succeeds (note is optional for those jenjang).
- [ ] Grade record correctly stores `recorded_by` as the authenticated guru's user id.

### Grade Aggregation View
- [ ] GET /grades?student_id=X&semester=Y returns all of that student's grades grouped by subject and category for the requested semester.
- [ ] Aggregation response includes a per-subject/per-category completeness flag indicating whether an expected entry is missing.
- [ ] Wali kelas calling the aggregation endpoint for their homeroom class receives rolled-up data across all subjects for every student in that class.

## Negative Acceptance Criteria

### Grade Entry by Category
- [ ] POST /grades with a score outside 0-100 is rejected with a 422 validation error and no record is created.
- [ ] POST /grades for a TK or SD tenant with the descriptive note omitted is rejected with a 422 validation error.
- [ ] POST /grades with an invalid/unrecognized category value (not one of formatif/sumatif/PR/tugas) is rejected with a 422 validation error.
- [ ] POST /grades scoped to a semester/kurikulum_version that does not match the tenant's active configuration is rejected.

### Grade Aggregation View
- [ ] GET /grades for a student_id outside the requester's tenant/school scope returns 403 or an empty result, never another tenant's data.
- [ ] GET /grades with a semester value that has no recorded grades returns an empty aggregation payload (not an error), including the completeness flags still marked as missing.
- [ ] GET /grades called by a role without grade-view permission (e.g. a student querying another student's id) is rejected with 403.

## Tasks
1. Define/extend SQLAlchemy `grades` model and Alembic migration (student_id, subject_id, semester, category, score, description, recorded_by).
2. Implement Pydantic v2 request/response schemas with jenjang-aware conditional validation for the description field.
3. Implement POST /grades endpoint with category, score-range, and semester/kurikulum_version validation.
4. Implement GET /grades?student_id=&semester= endpoint with grouping by subject/category and a missing/incomplete flag.
5. Enforce tenant/school/role scoping on both endpoints per the auth middleware (ticket #6/#7 dependency).
6. Add audit logging for grade edits after initial submit.
7. Write unit and integration tests covering validation rules, scoping, and aggregation grouping/flagging logic.

## Out of Scope
- FE grade entry UI (ticket #17)
- Rapor compilation itself (ticket #18 — this ticket only exposes the aggregation data it consumes)
- Attendance domain (ticket #14)

## Labels
`BE`, `penilaian`

## Estimate
L
