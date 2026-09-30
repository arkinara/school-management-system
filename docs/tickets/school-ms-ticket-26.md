# 26. BE: announcements + message threads domain

## Description
Implements the backend domain for the Parent-Teacher Communication feature: a broadcast announcement channel scoped by audience (all/class/jenjang) and 1-1 message threads between orang tua and guru tied to a student context. Enforces tenant/school scoping on every read and write so no cross-school leakage occurs except for Yayasan (super_admin), and produces the underlying records/events that later FE and notification tickets consume.

## Reference
- PRD feature(s): Parent-Teacher Communication
- PRD sub-feature(s): Announcement Board (BE portion), Direct Message Threads (BE portion)
- PRD path: `docs/PRD.md` lines 554-589

## Sub-feature: Announcement Board
Backend for staff (principal/TU/guru) to create, edit, and retract announcements scoped to an audience, with an audit trail and immediate feed visibility.

## Sub-feature: Direct Message Threads
Backend for 1-1 message threads tied to a student context, supporting ongoing reply exchange, read/unread state, and participant-plus-moderator visibility.

## Positive Acceptance Criteria

### Announcement Board
- [ ] Principal, TU, or guru can POST an announcement with title, body, and audience scope of `all`, `class`, or `jenjang`, and it persists with `author_id`, `tenant_id`, `school_id`, and `published_at`.
- [ ] An announcement scoped to `class` is retrievable by every user (student/parent/teacher) associated with that class, and one scoped to `jenjang` is retrievable by every user in that jenjang's tenant.
- [ ] Author (or principal) can edit an announcement's title/body and the prior version is retained in an audit record with editor and timestamp.
- [ ] Author (or principal) can retract an announcement; retracted announcements stop appearing in feed queries but remain queryable in the audit trail.
- [ ] Yayasan/super_admin can list announcements across all tenants/schools.

### Direct Message Threads
- [ ] Orang tua or guru can create a new message thread scoped to a specific `student_id`, with both participants recorded in `participant_ids`.
- [ ] Either participant can POST a reply message into an existing thread; the thread's message list returns messages in chronological order with `sender_id` and `sent_at`.
- [ ] A message has a `read_at` field that is null until the recipient's client marks it read via an explicit read endpoint/action.
- [ ] Principal/TU can list threads within their own school for moderation purposes, without being a `participant_id`.
- [ ] Threads and messages are queryable filtered to `tenant_id`/`school_id` matching the requester's scope (except Yayasan, which can query cross-school).

## Negative Acceptance Criteria

### Announcement Board
- [ ] A student, orang tua, or any role other than principal/TU/guru attempting to POST an announcement receives 403.
- [ ] An announcement create/edit request missing `title` or `body`, or with an audience value outside `all`/`class`/`jenjang`, is rejected with 422 and no record created.
- [ ] A user from School B cannot retrieve an announcement scoped to `class` or created within School A; the request returns 403 or an empty result, never School A's data.
- [ ] Editing or retracting an announcement authored by a different school's staff member is rejected with 403.
- [ ] Listing announcements for a school with none yet returns an empty list (200), not an error.

### Direct Message Threads
- [ ] A user who is not a participant, principal, or TU on a thread cannot GET that thread's messages; request returns 403 or empty result.
- [ ] Attempting to create a thread referencing a `student_id` outside the requester's own school is rejected with 403.
- [ ] POSTing a reply to a thread the sender is not a participant of is rejected with 403, and no message record is created.
- [ ] Marking a message as read by a user who is not the recipient (i.e. not the other participant) is rejected with 403.
- [ ] Requesting a thread list for a school/student with no threads yet returns an empty list (200), not an error.

## Tasks
1. Define/confirm SQLAlchemy models and Alembic migration for `announcements`, `message_threads`, and `messages` per the PRD schema (tenant_id, school_id, author_id/sender_id, audience/participant_ids, timestamps).
2. Implement Pydantic v2 schemas for announcement create/edit/retract and thread/message create/reply/mark-read payloads.
3. Build `announcements` router: POST create, PATCH edit, POST retract, GET list (feed) filtered by audience/tenant/school scope.
4. Build `message_threads` router: POST create thread, POST reply message, GET thread list, GET thread messages, POST mark-read.
5. Add an announcement audit trail table/mechanism capturing edit/retract history (actor, timestamp, previous values) — can hook into the shared audit facility from ticket #30 if it lands first, otherwise implement locally and migrate later.
6. Wire role-based access control (principal/TU/guru for announcement writes; participant/principal/TU for thread reads) using the existing JWT middleware (#2, #3).
7. Enforce tenant_id/school_id scoping on every query per the tenant-scoping helper pattern; add explicit Yayasan cross-tenant bypass path.
8. Write unit/integration tests covering all positive and negative acceptance criteria above.
9. Emit/record the underlying event data (announcement published, message sent) in a form ticket #29's notification center can later poll or query.

## Out of Scope
- FE announcement board UI (ticket #27)
- FE message thread UI (ticket #28)
- Notification-center aggregation UI (ticket #29 — this ticket only creates the underlying records/events)

## Labels
`BE`, `komunikasi`

## Estimate
L
