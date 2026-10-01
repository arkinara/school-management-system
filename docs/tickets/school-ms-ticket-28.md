# 28. FE: direct message threads — parent <-> teacher chat-like UI

## Description
Builds the 1-1 chat-like UI between orang tua and guru: a thread list with a compose/start action tied to a student context, and an in-thread reply view with read/unread indicators. Wires directly against the real backend from ticket #26, built in the same wave.

## Reference
- PRD feature(s): Parent-Teacher Communication
- PRD sub-feature(s): Direct Message Threads (FE portion)
- PRD path: `docs/PRD.md` lines 554-589

## Design Baseline
- Visual: `prototype-promax/pages/form-patterns.html` at Desktop 1440 (screenshot at `docs/screenshots-promax/form-patterns.png`)
- Design tokens: `prototype-promax/assets/theme.css` — HSL channels for primary/accent/semantic; resolve via Tailwind tokens in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`
- Typography: Fira Sans (UI) + Fira Code (tabular numerals, `font-variant-numeric: tabular-nums`); both via Google Fonts CDN. Replace Inter everywhere.
- Density: 8/10 — 40px table rows, 13px table text, 4/8px spacing rhythm
- Behavioural:
- Chat input follows the text-entry pattern in `form-patterns.html`
- `Ctrl/Cmd+K` command palette (focus trap, Esc to close, focus return) is a valid entry point into a thread
- New-message arrival uses a polite live region, never steals focus from the active input

## Sub-feature: Thread List & Compose
List of a user's message threads plus an action to start a new thread tied to a specific student, for orang tua and guru.

## Sub-feature: Message Read/Unread State
In-thread reply UI showing message history with visible read/unread indicators, and an unread badge on the thread list.

## Positive Acceptance Criteria

### Thread List & Compose
- [ ] Orang tua sees a "Messages" section listing their existing threads with each teacher, showing the other participant's name and the linked student's name.
- [ ] Guru sees a "Messages" section listing threads with parents of students in their classes.
- [ ] Orang tua or guru can start a new thread by selecting a student context and the counterpart participant, then sending an initial message, which calls the #26 create-thread endpoint.
- [ ] Selecting a thread from the list opens the full message history in chronological order with sender name/avatar and timestamp per message.
- [ ] Sending a reply within an open thread appends the new message to the view without a full page reload.

### Message Read/Unread State
- [ ] Threads containing at least one unread message (from the other participant) are visually distinguished (e.g. bold/badge) in the thread list.
- [ ] Opening a thread with unread messages triggers a mark-as-read call, and after that the unread indicator for that thread clears.
- [ ] Each message bubble shows whether it has been read by the recipient (e.g. a "read"/"delivered" indicator) sourced from the message's `read_at` field.
- [ ] Unread count/badge updates correctly after a new reply arrives while the thread list is open (poll or refetch-on-focus is acceptable).

## Negative Acceptance Criteria

### Thread List & Compose
- [ ] A user who is not a participant on a thread cannot see it in their thread list, and attempting to deep-link to another user's thread ID shows an access-denied state, not the thread content.
- [ ] Attempting to start a thread without selecting a student context or without entering an initial message is blocked client-side with a validation message.
- [ ] If the create-thread API call fails (e.g. 403 for cross-school student), the UI shows an error state and does not add a phantom thread to the list.
- [ ] When a user has zero threads, the thread list shows an explicit empty state ("No conversations yet") rather than a blank panel.

### Message Read/Unread State
- [ ] Sending a reply while offline/API-failure shows a clear failed-to-send indicator on that message rather than silently dropping it or marking it sent.
- [ ] While thread messages are loading, the view shows a loading state rather than an empty message pane that could be mistaken for "no messages."
- [ ] Mark-as-read is not triggered for messages sent by the viewing user themselves (a user's own sent messages never show as "unread" to them).
- [ ] If the mark-as-read API call fails, the unread badge remains showing (fails safe to "unread") rather than clearing incorrectly.

## Tasks
1. Build thread list component scoped to the logged-in orang tua/guru, showing counterpart name, student context, and unread indicator.
2. Build start-new-thread flow: student-context picker, counterpart selector, initial message input, wired to #26 create-thread endpoint.
3. Build thread detail/chat view rendering chronological messages with sender info, timestamp, and read indicator.
4. Wire reply send action to #26 reply endpoint with optimistic append and failed-send indicator on error.
5. Wire mark-as-read trigger on thread open, calling #26's mark-read endpoint and updating local unread state.
6. Implement loading, empty, and error states for both thread list and message view per negative AC.
7. Add access-denied handling for deep links to threads the user is not a participant of.
8. Write component/integration tests covering positive and negative acceptance criteria above.

## Out of Scope
- BE message thread logic itself (ticket #26, already built)
- Announcement board UI (ticket #27)
- Principal/TU moderation view of threads (deferred — base plan only requires participant visibility for MVP; moderation view out of scope for this ticket)

## Labels
`FE`, `komunikasi`

## Estimate
M
