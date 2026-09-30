# 20. BE: schedules domain — POST /schedules, GET /schedules, conflict detection

## Description
Implements the backend weekly-schedule domain: CRUD endpoints for schedule entries (class, subject, teacher, day, period, start/end time) plus conflict detection that blocks double-booking of a teacher or class in an overlapping period. This domain is consumed by TU/Principal (configure) and by guru/siswa/orang tua (read filtered views) in later tickets.

## Reference
- PRD feature(s): Jadwal Pelajaran
- PRD sub-feature(s): Schedule Configuration (BE portion)
- PRD path: `docs/PRD.md` lines 470-505

## Sub-feature: Schedule CRUD API
Provides POST/GET endpoints to create and list schedule entries, including bulk views per class and per teacher.

## Sub-feature: Conflict Detection
Rejects schedule entries that would double-book the same teacher or the same class in an overlapping day/period.

## Positive Acceptance Criteria

### Schedule CRUD API
- [ ] POST /schedules creates a schedule entry given class_id, subject_id, teacher_id, day, period, start_time, end_time and returns 201 with the created entry.
- [ ] GET /schedules?class_id=X returns all schedule entries for a given class, ordered by day then period.
- [ ] GET /schedules?teacher_id=X returns all schedule entries for a given teacher across the full week.
- [ ] GET /schedules with no filters (admin-scoped) returns the full weekly timetable for the tenant.

### Conflict Detection
- [ ] Creating a schedule entry for a teacher who is already assigned to a different class in an overlapping day/period is rejected with a 409 and a descriptive conflict payload identifying the clashing entry.
- [ ] Creating a schedule entry for a class that already has a session in an overlapping day/period is rejected with a 409 identifying the clashing entry.
- [ ] Editing an existing entry's time such that it no longer overlaps any other entry succeeds and clears the prior conflict.

## Negative Acceptance Criteria

### Schedule CRUD API
- [ ] POST /schedules with a missing required field (e.g. teacher_id) returns 422 with a field-level validation error.
- [ ] POST /schedules referencing a non-existent class_id, subject_id, or teacher_id returns 404/400 and creates no record.
- [ ] GET /schedules for a class/teacher with no entries returns an empty array (200), not an error.

### Conflict Detection
- [ ] Two entries for the same teacher on different days at the same period are NOT flagged as conflicting.
- [ ] Two entries with adjacent, non-overlapping periods (e.g. period ends 08:45, next starts 08:45) are NOT flagged as conflicting.
- [ ] A conflict check that errors internally (e.g. DB timeout) fails closed — the entry is not persisted — rather than silently allowing a double-booking.

## Tasks
1. Design and migrate `schedules` table (class_id, subject_id, teacher_id, day, period, start_time, end_time, tenant scoping) building on class/subject/teacher tables from #6.
2. Implement POST /schedules with input validation and referential integrity checks.
3. Implement overlap-detection query/service shared by create and update paths, covering both teacher and class dimensions.
4. Implement GET /schedules with class_id and teacher_id filters plus an unfiltered admin listing.
5. Implement PATCH/PUT for editing an existing entry, re-running conflict detection on the new time window.
6. Write unit/integration tests covering conflict edge cases (adjacent periods, same day different period, different day same period).

## Out of Scope
- FE schedule config UI (ticket #21)
- FE personalized schedule view (ticket #22)
- Teacher/subject/class master data itself (ticket #6, already built — this ticket only references it)

## Labels
`BE`, `jadwal`

## Estimate
L
