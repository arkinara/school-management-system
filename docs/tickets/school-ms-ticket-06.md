# 6. BE: users + roles + classes + subjects domain — CRUD scoped by role

## Description
This ticket implements CRUD for users (with role field), classes, and subjects — the master-data backbone that jadwal, absensi, and penilaian all reference downstream. It covers Yayasan assigning principal/TU admins to schools, and TU/Principal managing class and subject/aspek configuration and teacher profiles within their own school. Roles interacting: Yayasan/super_admin (admin assignment), TU/Principal (class, subject, teacher management).

## Reference
- PRD feature(s): `## Feature: Multi-tenant School Setup`, `## Feature: Master Data Management`
- PRD sub-feature(s): `## Sub-feature: Admin Assignment`, `## Sub-feature: Class & Subject Configuration`, `## Sub-feature: Teacher Management`
- PRD path: `docs/PRD.md` lines 213-257, 260-305

## Sub-feature: Admin Assignment
Assign, reassign, or remove a principal or TU admin user to/from a specific school, with every change audit-logged.

## Sub-feature: Class & Subject Configuration
CRUD for classes (name, grade_level, jurusan, wali_kelas assignment) and a jenjang-filtered subject/aspek list (e.g. TK shows tumbuh-kembang aspects instead of formal subjects).

## Sub-feature: Teacher Management
CRUD for teacher profiles and their subject/class assignment data, which feeds directly into the jadwal (schedule) domain built in a later ticket.

## Positive Acceptance Criteria

### Admin Assignment
- [ ] Super_admin can create a new user with role principal or admin (TU) and assign them to a specific school_id.
- [ ] Super_admin can reassign an existing principal/admin user to a different school, and the change is reflected on the user's record and in an audit log entry.
- [ ] Super_admin can remove (deactivate) an admin's assignment to a school, and the removal is audit-logged with timestamp and acting super_admin id.
- [ ] An assigned principal/admin can log in and their JWT/session resolves to the correct school_id.

### Class & Subject Configuration
- [ ] TU/Principal can create a class with name, grade_level, wali_kelas_id, and academic_year; for an SMA tenant, jurusan can also be set.
- [ ] TU/Principal can edit an existing class's wali_kelas assignment and see the change reflected immediately.
- [ ] Fetching the subject list for a TK tenant returns tumbuh-kembang aspect categories; fetching for SD/SMP/SMA returns formal subjects.
- [ ] TU/Principal can assign one or more subjects to a class/grade-level combination.

### Teacher Management
- [ ] TU/Principal can create a teacher profile (user with role teacher) and optionally flag them as wali_kelas.
- [ ] TU/Principal can assign a teacher to one or more subjects and one or more classes.
- [ ] GET teacher detail returns the full list of assigned subject-class pairs, in a shape consumable by the future jadwal configuration endpoint (ticket #20).

## Negative Acceptance Criteria

### Admin Assignment
- [ ] A non-super_admin role attempting to assign/reassign/remove a school admin receives 403.
- [ ] Assigning an admin to a non-existent school_id returns 404/422 and no assignment is created.
- [ ] Reassigning a user who does not currently hold role principal/admin returns 422 with a clear validation message.

### Class & Subject Configuration
- [ ] Creating a class with jurusan set on a non-SMA tenant returns 422 (jurusan is SMA-only).
- [ ] TU/Principal from School A cannot create, edit, or view a class belonging to School B (403 or empty result).
- [ ] Assigning a subject that does not belong to the class's tenant (mismatched tenant_id) returns 422.

### Teacher Management
- [ ] Creating a teacher profile with a duplicate email within the same tenant returns 409/422.
- [ ] Assigning a teacher to a class outside their own school returns 403/422.
- [ ] Fetching a teacher's assignments for a teacher_id that does not exist returns 404.

## Tasks
1. Add/confirm SQLAlchemy models for `users` (with role enum), `classes`, and `subjects` per the PRD schema.
2. Write Alembic migration for `classes` and `subjects` tables and any teacher-subject/teacher-class association tables needed.
3. Implement RBAC dependency helpers for super_admin-only (admin assignment) vs TU/principal-scoped (class/subject/teacher) endpoints.
4. Implement admin assignment endpoints: create/reassign/remove principal or TU user on a school, with an audit log table/entries.
5. Implement class CRUD endpoints with jenjang-aware jurusan validation and wali_kelas assignment.
6. Implement subject CRUD/list endpoints with jenjang-based filtering (tumbuh-kembang aspects for TK).
7. Implement teacher profile CRUD and subject/class assignment endpoints, scoped to acting user's school_id.
8. Write unit/integration tests covering all positive and negative AC above, including cross-school access denial.

## Out of Scope
- Tenant/school creation itself (ticket #5).
- Student/parent records (ticket #7).
- Actual schedule/timetable entries — this ticket only manages teacher-subject-class assignment master data, not the timetable (ticket #20).

## Labels
`BE`, `master-data`

## Estimate
L
