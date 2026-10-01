# PM Audit — prototype-promax as canonical design baseline
## Date: 2026-10-01
## Decision: prototype-promax/ replaces prototype/ as the design + behavioural reference for FE tickets.
## Tickets adjusted: 26
| # | Title | Promax Page | Behavioural Notes |
|---|-------|---|---|
| #1 | Infra: monorepo scaffold | assets/theme.css | Fira Sans/Code Google Fonts, token mirror into globals.css, Tailwind token wiring, Tasks +3 |
| #4 | FE Better Auth wiring | auth-sign-in.html + form-patterns.html | role=alert + focus-first-invalid, reduced-motion |
| #8 | FE principal dashboard | principal-dashboard.html | sparklines, bullet-bar targets, donut attendance, ranked bullet bars, announcements feed, command palette |
| #9 | FE guru dashboard | guru-dashboard.html | today-timeline, sortable grade-entry queue (aria-sort), notification bell+badge |
| #10 | FE siswa dashboard | siswa-dashboard.html | today-schedule list, rapor bullet bars, attendance sparkline |
| #11 | FE orang tua dashboard | orang-tua-dashboard.html | sibling picker, payment sidebar, per-subject bullet bars |
| #12 | FE TU dashboard | tu-dashboard.html | ops queue, bulk-select + indeterminate on overdue SPP, sparkline KPIs |
| #13 | FE yayasan dashboard | yayasan-dashboard.html | sortable multi-tenant table, per-tenant donut/sparkline |
| #15 | FE absensi input | absensi-input.html | keyboard entry H/I/S/A, undo toast |
| #17 | FE grade entry | principal-dashboard.html + form-patterns.html | sortable data-value table, role=alert validation, undo toast |
| #19 | FE rapor view | rapor-view.html | semester picker, Kurikulum Merdeka fase, print stylesheet |
| #21 | FE jadwal config | form-patterns.html + principal-dashboard.html | multi-step wizard, role=alert conflict errors |
| #22 | FE jadwal view | guru-dashboard.html + siswa-dashboard.html | timeline/schedule reuse, hash deep link |
| #24 | FE SPP bill generation | spp-bills.html | sortable + bulk-select + indeterminate, undo toast |
| #25 | FE SPP payment recording | spp-bills.html | bulk-select payments, undo toast not confirm dialog |
| #27 | FE announcement board | principal-dashboard.html + form-patterns.html | feed pattern, role=alert composer, undo toast |
| #28 | FE direct messages | form-patterns.html | chat input pattern, Ctrl/Cmd+K palette entry, polite live region |
| #29 | FE notification center | assets/app.js | bell + count badge dropdown, polite live region, hash deep link |
| #31 | FE Wiring: principal dashboard | principal-dashboard.html | live sparkline/donut re-render, aria-sort preserved, command palette |
| #32 | FE Wiring: guru dashboard | guru-dashboard.html | timeline + sortable queue live, undo toast on mutation |
| #33 | FE Wiring: siswa dashboard | siswa-dashboard.html | live schedule/rapor bars, sparkline stays inline SVG |
| #34 | FE Wiring: orang tua dashboard | orang-tua-dashboard.html | sibling picker live data, payment sidebar/grade bars live |
| #35 | FE Wiring: TU dashboard | tu-dashboard.html | bulk-select/indeterminate live, undo toast on bulk action |
| #36 | FE Wiring: absensi page | absensi-input.html | keyboard entry live submit, undo toast correction |
| #37 | FE Wiring: rapor view | rapor-view.html | live semester/fase data, print stylesheet retained |
| #38 | FE Wiring: SPP pages | spp-bills.html | sortable/bulk-select live, undo toast on void/record |

## Tickets NOT adjusted: 12
| # | Title | Reason |
|---|---|---|
| #2 | BE shared scaffolding | BE-only, no design impact |
| #3 | BE auth domain | BE-only, no design impact |
| #5 | BE tenants + schools domain | BE-only, no design impact |
| #6 | BE users/roles/classes/subjects domain | BE-only, no design impact |
| #7 | BE students + parents linking domain | BE-only, no design impact |
| #14 | BE absensi domain | BE-only, no design impact |
| #16 | BE grades domain | BE-only, no design impact |
| #18 | BE rapor domain | BE-only, no design impact |
| #20 | BE schedules domain | BE-only, no design impact |
| #23 | BE SPP domain | BE-only, no design impact |
| #26 | BE announcements + message threads domain | BE-only, no design impact |
| #30 | BE audit log + observability | BE-only, no design impact |

## Verifier status: PASS - tickets checked: 38
