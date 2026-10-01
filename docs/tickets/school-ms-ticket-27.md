# 27. FE: announcement board — broadcast UI for principal/TU/guru; viewer for everyone

## Description
Builds the frontend for the announcement channel: a composer for principal/TU/guru to broadcast announcements scoped by audience, and a feed viewer so every role sees relevant announcements on their dashboard. Wires directly against the real backend from ticket #26, built in the same wave.

## Reference
- PRD feature(s): Parent-Teacher Communication
- PRD sub-feature(s): Announcement Board (FE portion)
- PRD path: `docs/PRD.md` lines 554-589

## Design Baseline
- Visual: `prototype-promax/pages/principal-dashboard.html` at Desktop 1440 (screenshot at `docs/screenshots-promax/principal-dashboard.png`)
- Design tokens: `prototype-promax/assets/theme.css` — HSL channels for primary/accent/semantic; resolve via Tailwind tokens in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`
- Typography: Fira Sans (UI) + Fira Code (tabular numerals, `font-variant-numeric: tabular-nums`); both via Google Fonts CDN. Replace Inter everywhere.
- Density: 8/10 — 40px table rows, 13px table text, 4/8px spacing rhythm
- Behavioural:
- Announcement feed list pattern matches the pending-announcements block on `principal-dashboard.html`
- Composer form validation uses `role="alert"` + focus-first-invalid, per `form-patterns.html`
- Deleting/un-publishing an announcement surfaces an undo toast, not a confirm dialog

## Sub-feature: Broadcast Composer (Staff)
Form for principal/TU/guru to create an announcement with title, body, and audience scope (all/class/jenjang), plus edit/retract controls.

## Sub-feature: Announcement Feed Viewer (All Roles)
Feed component showing relevant announcements on each role's dashboard, updating immediately after a new announcement is posted.

## Positive Acceptance Criteria

### Broadcast Composer (Staff)
- [ ] Principal, TU, or guru sees a "New Announcement" action that opens a form with title, body, and audience-scope selector (all/class/jenjang, with class/jenjang requiring a target picker).
- [ ] Submitting a valid form calls the #26 create-announcement endpoint and, on success, shows a confirmation toast and the new announcement appears in the composer's own "sent" list without a page reload.
- [ ] Author can open an existing announcement they authored, edit title/body, and save; the feed reflects the updated content immediately.
- [ ] Author or principal can retract an announcement via a confirm-then-retract action; retracted item disappears from all feeds immediately.
- [ ] Class/jenjang target picker is populated from real class/tenant data (not hardcoded) scoped to the acting user's school.

### Announcement Feed Viewer (All Roles)
- [ ] Orang tua dashboard shows a "Latest Announcements" widget listing announcements scoped to their child's class/jenjang/school, most recent first.
- [ ] Guru, siswa, principal, and TU each see the announcement feed filtered correctly to their own school/class/jenjang scope on their respective dashboards.
- [ ] Clicking an announcement in the feed opens a detail view showing full title, body, author, and published date/time.
- [ ] A newly posted announcement appears in the relevant viewer's feed without requiring a manual page refresh (poll or refetch-on-focus is acceptable).
- [ ] Yayasan can view announcements across all schools/tenants in a filterable list.

## Negative Acceptance Criteria

### Broadcast Composer (Staff)
- [ ] A student or orang tua does not see the "New Announcement" composer entry point anywhere in their UI.
- [ ] Submitting the composer form with an empty title or body shows inline validation errors and does not call the API.
- [ ] If the #26 create-announcement call returns 403 (e.g. stale session/role change), the UI shows an error state and does not optimistically insert the announcement into the feed.
- [ ] Attempting to edit/retract an announcement authored by another school's staff (API returns 403) surfaces an error message and leaves the feed unchanged.

### Announcement Feed Viewer (All Roles)
- [ ] When a school/class/jenjang has zero announcements, the feed widget shows an explicit empty state (e.g. "No announcements yet"), not a blank area or spinner stuck indefinitely.
- [ ] While the announcement list is loading, the widget shows a loading skeleton/spinner rather than a flash of empty content.
- [ ] If the feed fetch fails (network/API error), the widget shows a retry-capable error state instead of silently showing an empty list.
- [ ] A retracted announcement does not reappear in any role's feed after retraction, even after a refresh.

## Tasks
1. Build announcement composer form component (title, body, audience-scope selector with class/jenjang target picker) for principal/TU/guru roles.
2. Wire composer submit/edit/retract actions to the #26 announcement endpoints, including error/success toast handling.
3. Build announcement feed widget component reusable across the six dashboards, with role-appropriate scoping of the fetch query.
4. Build announcement detail view (modal or route) for viewing full announcement content.
5. Implement loading, empty, and error states for the feed widget per negative AC.
6. Implement refetch-on-focus or short-interval polling so new/edited/retracted announcements propagate without manual refresh.
7. Add role-based conditional rendering so composer entry points are hidden for student/orang tua.
8. Write component/integration tests covering positive and negative acceptance criteria above.

## Out of Scope
- BE announcement logic itself (ticket #26, already built)
- Message thread UI (ticket #28)
- Notification bell aggregation (ticket #29)

## Labels
`FE`, `komunikasi`

## Estimate
M
