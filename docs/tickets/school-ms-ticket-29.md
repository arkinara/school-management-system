# 29. FE: notification center — in-app bell, per-user feed

## Description
Builds a cross-cutting in-app notification center: a header bell icon with unread count and a per-user chronological feed, aggregating events already produced by absensi (non-hadir notifications), SPP (overdue alerts), and komunikasi (announcements/messages) triggers. Gives every role a single place to see unread items without a new notification-domain backend.

## Reference
- PRD feature(s): Absensi / Attendance (notification sub-feature); SPP / Tuition Billing (overdue alerts sub-feature); Parent-Teacher Communication (unread indicators)
- PRD sub-feature(s): Attendance Notification; Overdue Tracking & Alerts; unread announcement/message indicators
- PRD path: `docs/PRD.md` lines 351-395, 507-552, 554-589

## Sub-feature: In-app Notification Bell
Header bell icon showing an aggregated unread count across absensi, SPP, and komunikasi events, with a dropdown preview.

## Sub-feature: Per-user Notification Feed
A dedicated, chronologically ordered notification feed page/panel scoped to the logged-in user, with mark-as-read behavior.

## Positive Acceptance Criteria

### In-app Notification Bell
- [ ] Every authenticated user sees a bell icon in the header showing a numeric badge equal to their total unread count across absensi non-hadir alerts, SPP overdue alerts, new announcements, and new/unread messages.
- [ ] Clicking the bell opens a dropdown preview listing the most recent unread items (e.g. latest 5-10) with a short label per item and relative timestamp.
- [ ] Clicking a notification item in the dropdown navigates the user to the relevant destination (e.g. the SPP bill, the attendance record, the announcement, or the message thread).
- [ ] The badge count updates after new events occur (poll or refetch-on-focus/interval is acceptable) without requiring a full page reload.

### Per-user Notification Feed
- [ ] Logged-in user can open a full notification feed page/panel showing all their notifications in reverse-chronological order, each tagged with its source domain (absensi/SPP/komunikasi).
- [ ] User can mark an individual notification as read, and it visually updates (e.g. dims/removes bold) and decrements the bell's unread count.
- [ ] User can mark all notifications as read in one action, clearing the bell badge to zero.
- [ ] Orang tua's feed correctly aggregates events tied to all of their linked children when they have more than one child.

## Negative Acceptance Criteria

### In-app Notification Bell
- [ ] When a user has zero unread notifications, the bell shows no badge (or a "0" state) rather than a stale/incorrect count.
- [ ] If the underlying event source (e.g. SPP overdue query) fails to load, the bell degrades gracefully (shows last-known count or a neutral state) rather than crashing the header.
- [ ] A user never sees notification items sourced from another school/tenant's events (scoping bug); cross-tenant leakage in the aggregation query is treated as a blocking defect.
- [ ] The bell dropdown does not double-count or duplicate the same underlying event if it is polled multiple times.

### Per-user Notification Feed
- [ ] When the feed has no notifications yet, it shows an explicit empty state ("No notifications yet"), not a blank page.
- [ ] While the feed is loading, a loading state is shown rather than a flash of an empty list.
- [ ] If the mark-as-read call fails, the notification remains in its unread visual state (fails safe) rather than clearing incorrectly.
- [ ] Marking all-as-read does not affect another user's notifications (verified via scoping to the logged-in user's own aggregation query).

## Tasks
1. Design and implement a client-side aggregation layer that queries/polls the existing absensi non-hadir data, SPP overdue bill data, and komunikasi (#26) announcement/message data to build a unified notification list.
2. Build the header bell component with unread badge and dropdown preview.
3. Build the full notification feed page/panel with per-domain tagging, mark-as-read, and mark-all-as-read actions.
4. Implement per-user, per-tenant/school scoping in the aggregation queries so no cross-tenant data appears.
5. Implement read-state tracking (e.g. local read markers keyed by underlying event ID, since there is no dedicated notifications table) that correctly persists across sessions.
6. Implement loading, empty, and degraded/error states per negative AC.
7. Wire notification-item click-through navigation to the correct destination screen per domain (attendance record, SPP bill, announcement, message thread).
8. Write component/integration tests covering positive and negative acceptance criteria above, including multi-child orang tua aggregation.

## Out of Scope
- The underlying event-generation logic for absensi/SPP/announcements (owned by tickets #14, #23, #26 respectively — this ticket only aggregates and displays; it is cross-cutting and consumes existing trigger points, not a new domain)
- Push notifications / email / SMS delivery (Phase 2, out of MVP scope per PRD)

## Labels
`FE`, `komunikasi`

## Estimate
M
