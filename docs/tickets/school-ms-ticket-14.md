# 14. BE: absensi domain — POST /attendances, GET /attendances, parent notification trigger

## Description
This ticket implements the backend Absensi (attendance) domain: recording daily attendance per class session, triggering a parent notification on non-hadir status, and aggregating attendance into monthly/semester recaps consumable by rapor compilation. It covers the PRD's Absensi / Attendance feature in full on the backend side. Guru record attendance, Wali Kelas correct it for their homeroom, and Orang Tua receive the resulting notifications.

## Reference
- PRD feature(s): `## Feature: Absensi / Attendance`
- PRD sub-feature(s): `## Sub-feature: Daily Attendance Entry` (BE portion), `## Sub-feature: Attendance Notification`, `## Sub-feature: Attendance Recap`
- PRD path: `docs/PRD.md` lines 351-395

## Sub-feature: Attendance Recording API
Covers `POST /attendances` for bulk per-class-session submission and `GET /attendances?class_id=&date=` for retrieval, including the same-day edit window and audit-logging of edits made after that window.

## Sub-feature: Attendance Notification Trigger
Covers the server-side trigger that fires a parent notification when a student's status is izin/sakit/alpa, with no duplicate notification on re-submission unless the status actually changed.

## Sub-feature: Attendance Recap Aggregation
Covers the monthly/semester roll-up per student per status, exposed in a form the rapor compilation domain (ticket #18) can consume.

## Positive Acceptance Criteria

### Attendance Recording API
- [ ] `POST /attendances` accepts a bulk payload (class_id, date, array of {student_id, status}) and persists one attendance record per student with status in {hadir, izin, sakit, alpa}, recorded_by set to the authenticated teacher.
- [ ] `GET /attendances?class_id=&date=` returns the full roster's attendance for that class/date, including students with no explicit override (defaulted to hadir at submission time).
- [ ] An edit submitted within the same calendar day as the original submission overwrites the existing record without creating an audit-log entry.
- [ ] An edit submitted on a later date than the original submission updates the record and creates an audit-log entry capturing old status, new status, editor, and timestamp.
- [ ] Wali Kelas can call `GET /attendances` and submit corrections for any class where they are the assigned wali_kelas, for any past date.

### Attendance Notification Trigger
- [ ] Submitting a student with status izin, sakit, or alpa creates a notification record targeted at that student's linked orang tua account(s).
- [ ] A student with multiple linked guardians (per PRD's many-to-many parent-student linking) generates a notification to each linked guardian.
- [ ] Re-submitting the same class/date with an unchanged status for a student does not create a duplicate notification.
- [ ] Changing a student's status on a same-day edit (e.g. hadir to sakit) creates a new notification reflecting the updated status.

### Attendance Recap Aggregation
- [ ] Recap endpoint returns, per student per month, a count of days in each status (hadir/izin/sakit/alpa).
- [ ] Recap endpoint supports a semester-range aggregation (sum across the semester's months) per student.
- [ ] Recap output structure is documented/typed such that ticket #18 (rapor compilation) can consume it directly without additional transformation.

## Negative Acceptance Criteria

### Attendance Recording API
- [ ] `POST /attendances` rejects a payload with an invalid status value (not in hadir/izin/sakit/alpa) with a 422 validation error, and persists nothing from that request.
- [ ] `POST /attendances` from a teacher not assigned to teach that class/session is rejected with 403 and no records are written.
- [ ] `GET /attendances` for a class_id outside the requester's tenant/school scope returns 403 or an empty result, never another school's data.
- [ ] Submitting attendance for a date more than N days in the past (outside any configured correction window for non-wali-kelas roles) is rejected with a clear error rather than silently accepted.

### Attendance Notification Trigger
- [ ] If notification dispatch fails (e.g. downstream error), the attendance record itself is still persisted — a notification failure never rolls back or blocks the attendance write.
- [ ] A student with zero linked guardians produces zero notifications and does not error the attendance submission.
- [ ] Hadir status never generates a notification, including on edit from a non-hadir status back to hadir (only a status-change alert reflecting the return-to-hadir may be considered, but no izin/sakit/alpa-style alert fires).

### Attendance Recap Aggregation
- [ ] Recap for a student/month with zero attendance records returns explicit zero counts per status, not a missing/null response.
- [ ] Recap request for a semester with incomplete data (some months missing records) returns the partial aggregation with an explicit indicator of which months have no data, rather than silently treating missing months as zero without flagging.
- [ ] Recap request scoped outside the requester's tenant/school is rejected with 403, never returning cross-school data.

## Tasks
1. Design and migrate the `attendances` table (student_id, class_id, date, status, recorded_by, note) per PRD schema, plus an `attendance_audit_log` table for post-window edits.
2. Implement `POST /attendances` bulk-submit endpoint with Pydantic v2 validation, role check (guru assigned to session, or wali_kelas), and tenant/school scoping.
3. Implement same-day vs. post-window edit logic, writing audit-log entries only for post-window edits.
4. Implement `GET /attendances?class_id=&date=` with tenant/school/role scoping.
5. Implement notification trigger service: on non-hadir status write, resolve linked guardians and create notification record(s); dedupe on unchanged re-submission.
6. Implement recap aggregation endpoint(s) for monthly and semester roll-up per student per status, with a stable output schema for rapor consumption.
7. Write unit/integration tests covering recording, edit-window behavior, notification firing/dedup, and recap aggregation (including empty/partial-data cases).
8. Document the recap output schema for consumption by ticket #18.

## Out of Scope
- FE attendance input UI (class roster screen, bulk-mark controls) — covered by ticket #15, which will call this ticket's API.
- Rapor compilation logic itself — covered by ticket #18; this ticket only produces the recap data it consumes.
- Notification center/inbox UI for displaying notifications to orang tua — covered by ticket #29; this ticket only fires the trigger and creates the notification record.

## Labels
`BE`, `absensi`

## Estimate
L
