# 7. BE: students + parents linking domain — student record, parent assignment, sibling logic

## Description
This ticket implements student profile CRUD and the many-to-many parent-student linking, including sibling lookups for a parent with multiple children, scoped to the acting user's school_id. It covers the "Student & Parent Records" sub-feature of Master Data Management. TU and Principal manage these records; the linking logic also underpins what data an Orang Tua (parent) role can later see across their linked children.

## Reference
- PRD feature(s): `## Feature: Master Data Management`
- PRD sub-feature(s): `## Sub-feature: Student & Parent Records`
- PRD path: `docs/PRD.md` lines 260-305

## Sub-feature: Student Record Management
Create and edit a student's profile (nis, name, birth_date, class assignment) and deactivate (not hard-delete) a student on graduation or transfer.

## Sub-feature: Parent/Guardian Linking & Sibling Logic
Link one or more parent/guardian accounts to a student (many guardians to one student, one parent to many children) and support sibling lookup for a parent account.

## Positive Acceptance Criteria

### Student Record Management
- [ ] TU/Principal can create a student with nis, full_name, birth_date, and class_id, scoped to their own school_id.
- [ ] TU/Principal can edit a student's class_id (e.g. promotion to next grade) and the change is reflected immediately in class roster queries.
- [ ] TU/Principal can deactivate a student (enrollment_status set to inactive/graduated/transferred) and the student record is retained, not deleted.
- [ ] A deactivated student is excluded from active class roster listings but still retrievable via an explicit "include inactive" query for historical records (grades, attendance, SPP).

### Parent/Guardian Linking & Sibling Logic
- [ ] TU/Principal can link an existing or newly created parent user account to a student as a guardian.
- [ ] A single student can have two or more guardian accounts linked (e.g. mother and father), each independently retrievable via GET student guardians.
- [ ] A single parent account can be linked to two or more student records (siblings), and GET /parents/{id}/children returns all linked students.
- [ ] Unlinking a guardian from a student removes that specific link without affecting the guardian's link to other children.

## Negative Acceptance Criteria

### Student Record Management
- [ ] Creating a student with a nis that already exists within the same school returns 409/422.
- [ ] Creating a student referencing a class_id belonging to a different school returns 422/403.
- [ ] TU/Principal from School A cannot view, edit, or deactivate a student belonging to School B (403 or empty result).

### Parent/Guardian Linking & Sibling Logic
- [ ] Linking a parent account whose role is not "parent" (e.g. a teacher account) to a student returns 422.
- [ ] Linking a guardian to a student in a different school than the guardian's scoped school returns 403/422.
- [ ] Requesting sibling/children list for a parent_id with no linked students returns an empty list (200), not an error.

## Tasks
1. Add/confirm SQLAlchemy model for `students` per the PRD schema (id, user_id, school_id, class_id, nis, birth_date, enrollment_status).
2. Add a student-guardian association table (many-to-many between students and parent users) if not already implied by schema, with Alembic migration.
3. Implement Pydantic v2 schemas for student create/update/read and guardian link/unlink.
4. Implement student CRUD endpoints scoped to acting user's school_id, including deactivate (soft-delete via enrollment_status).
5. Implement guardian linking endpoints: link parent to student, unlink, GET student's guardians, GET parent's children (sibling lookup).
6. Enforce cross-school access denial and role validation (only role=parent users can be linked as guardians).
7. Write unit/integration tests covering all positive and negative AC above, including sibling lookup and soft-delete retention.

## Out of Scope
- Class/subject/teacher CRUD (ticket #6).
- Attendance/grade records referencing students (tickets #14, #16).
- SPP bills referencing students (ticket #23).

## Labels
`BE`, `master-data`

## Estimate
M
