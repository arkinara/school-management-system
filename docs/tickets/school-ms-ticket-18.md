# 18. BE: rapor domain — compile grades + narrative, publish workflow, parent visibility

## Description
Implements the backend that compiles attendance (#14) and grade (#16) records into a fase-appropriate rapor draft, routes that draft through wali-kelas finalization and principal approval, and controls when it becomes visible to orang tua and siswa. This is the domain that ticket #19's parent/student viewer will eventually be wired to (via #37), and it must enforce that draft rapor are never exposed outside staff roles.

## Reference
- PRD feature(s): Rapor / Report Card
- PRD sub-feature(s): Rapor Compilation, Review & Publish Workflow
- PRD path: `docs/PRD.md` lines 433-467

## Sub-feature: Rapor Compilation
Auto-compiles a draft rapor per student/semester from attendance and grade records once the grade-entry deadline passes, applying the tenant's kurikulum_version/fase template, and blocks compilation with a clear gap list when required data is missing.

## Sub-feature: Review & Publish Workflow
Routes the compiled draft through wali kelas finalization and mandatory principal approval before status flips to published, after which the rapor is immutable except through an explicit re-publish/correction flow.

## Positive Acceptance Criteria

### Rapor Compilation
- [ ] Triggering compilation for a student/semester after the grade-entry deadline produces a `report_cards` record in `draft` status built from that student's attendance and grade records.
- [ ] Compilation for a TK/SD tenant produces narrative-structured `compiled_data`; compilation for an SMP/SMA tenant produces numeric-score-plus-description `compiled_data`, matching the tenant's kurikulum_version/fase.
- [ ] Compilation correctly aggregates the attendance recap (hadir/izin/sakit/alpa counts) and per-subject grade rollups into the compiled payload.
- [ ] Re-running compilation for a student whose underlying data has changed since the last draft regenerates the draft rather than duplicating a record.

### Review & Publish Workflow
- [ ] Wali kelas can edit/finalize a draft rapor for a student in their homeroom class, transitioning it toward a "ready for approval" state.
- [ ] Principal approval action on a finalized draft flips its status to `published` and sets `published_at`.
- [ ] A published rapor becomes visible to the linked orang tua and the siswa themselves via the read endpoint once status is `published`.
- [ ] An explicit correction/re-publish action on an already-published rapor creates a new versioned/corrected record rather than silently mutating the original.

## Negative Acceptance Criteria

### Rapor Compilation
- [ ] Compiling a student/semester with one or more ungraded required subjects is rejected with a clear list of the specific missing subjects/categories, and no draft record is created.
- [ ] Compilation attempted before the grade-entry deadline for the semester is rejected or blocked.
- [ ] Compilation request for a student outside the requester's tenant/school scope returns 403 or an empty result.

### Review & Publish Workflow
- [ ] A wali kelas attempting to finalize a draft for a student outside their assigned homeroom class is rejected with 403.
- [ ] Attempting to flip a rapor to `published` without a recorded principal approval step is rejected.
- [ ] Orang tua or siswa requesting a rapor that is still in `draft` status receives a 403/not-found response, never the draft content.
- [ ] Attempting to directly edit the `compiled_data` of an already-published rapor (outside the explicit correction flow) is rejected.

## Tasks
1. Define/extend SQLAlchemy `report_cards` model and Alembic migration (student_id, semester, status, kurikulum_version, compiled_data, finalized_by, published_at).
2. Implement compilation service that reads attendance (#14) and grades (#16) data and builds the fase-specific `compiled_data` shape.
3. Implement gap-detection logic that blocks compilation and returns a structured list of missing grade entries.
4. Implement wali-kelas finalize endpoint scoped to their homeroom class.
5. Implement principal-approval endpoint that transitions status to `published` and sets `published_at`.
6. Implement read endpoint enforcing draft-invisibility for orang tua/siswa roles.
7. Implement explicit correction/re-publish flow that versions rather than mutates published records.
8. Write unit and integration tests covering compilation gating, role-scoped finalize/approve, and draft-visibility enforcement.

## Out of Scope
- FE rapor view page for parent/student (ticket #19)
- Attendance/grade domain logic themselves (tickets #14, #16 — this ticket only consumes their data)
- Notification of rapor publish (ticket #29 notification center, if wired)

## Labels
`BE`, `rapor`

## Estimate
XL
