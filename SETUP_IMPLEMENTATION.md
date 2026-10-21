# Setup financial profile — 1 October 2026 (Asia/Bangkok)

## Earlier form scope (layout superseded below)
/setup now uses docs/mockups/Setup page.png as its layout reference: a light form card on a navy/indigo background, monthly planning income, income day, current-month budget, four financial intentions and Save/start. Red annotation frames are not UI. Existing AppLayout/navigation is retained.

This supersedes the earlier read-only checklist. The old checklist browser checks do not constitute acceptance of this new form. User acceptance is recorded separately below.

## Persistence
- GET /settings prefills all fields before editing. A name field appears only when displayName is absent.
- PUT /settings adds optional financialIntention with the exact choices เงินสำรองฉุกเฉิน / ออมเงินซื้อของ / ลดหนี้ / ลงทุน. It updates Profile.goal inside the existing transaction; omission preserves legacy text. GET continues returning that text as legacyGoal.
- No Goal is created, and primaryGoalId is copied from the latest settings, never from intention selection.
- Blank income/budget means keep the latest stored value. A previously configured budget is not cleared by blanking the form. New accounts without a budget may retain null; setting a budget requires a positive decimal string.
- Uncertain income day is paydayDay:null; days 1–31 use the existing month-end convention.
- Before PUT the UI reads settings again, preserves fields that were not edited, and rejects a changed month/account. Existing displayName and notification toggles are preserved. notifyAnomaly is omitted so Setup does not alter anomaly pending state.
- The existing full PUT contract is retained apart from financialIntention. Budget notification fields remain required; the DB constraint already enforces enabled = (notifyNearLimit OR notifyExceeded).
- Busy state prevents duplicate submission; errors retain the draft. Navigation to Overview and profile refresh happen only after a successful response for the same mounted session.
- AbortController/session-key checks protect loading; lifetime/token guards protect save responses. No focus-based reload overwrites a draft.
- The form redesign added no endpoint/schema/migration/dependency. The later mandatory-completion change below adds one column/migration. No application database used.
- The existing API has no optimistic concurrency token: the extra read preserves changes already visible before PUT, but is not a cross-tab compare-and-swap guarantee.

## AI verification
Results are recorded after running the revised tests; they are separate from user acceptance.
- setupChecklist.test.ts now tests the form draft/payload, blank preservation, latest-value merge, uncertainty, validation and month/account guards.
- setup.database.test.ts uses real HTTP/PostgreSQL on an explicitly selected isolated database with new synthetic accounts. Covers intention persistence, no Goal/Transaction creation, existing primary Goal/name/budget, notifications, legacy omission, ownership and rollback on invalid input/month.
- setup.browser.cjs uses API mocks for first load, conditional name, prefill, validation, 500/409, save success, duplicate-submit guard, loading/retry, stale load/save session switches, keyboard and 1440/390px.
- Settings/Notifications/transactions-limit regression remains in scope. Dashboard and DashboardDaily are untouched.
- Original 26 local paths and acceptance documents remain outside this work. No stage/commit/push.

## Final AI results
- Backend/frontend builds PASS (existing bundle-size warning).
- 28 unit/real HTTP-PostgreSQL/notification regression tests PASS on isolated Setup acceptance DB.
- Setup browser API mocks: 4 groups PASS. Settings browser API mocks: 11 groups PASS.
- 1440/390px screenshots inspected; no horizontal overflow.
- Initial notification fixture violated the existing enabled CHECK constraint; fixture corrected to valid values, and unnecessary notification contract expansion removed. Settings browser initially used the wrong default port; rerun against latest preview on 5177 passed without changing its source.
- Acceptance services 5181 -> 4005 updated to this financial form. Earlier checklist results are not acceptance of this form; see the separate user acceptance below.

## Earlier mandatory completion (superseded by first-login invitation below)
- User.setupCompletedAt is a nullable timestamp. Migration 20261001010000_add_setup_completion adds the column with no default/backfill: existing and new accounts are incomplete regardless of their financial fields.
- Setup sends completeSetup:true to PUT /settings. The timestamp is set once, under the existing user lock and inside the same database transaction as the financial form. Ordinary Settings saves omit the flag and do not complete Setup; false/arbitrary timestamp input is rejected.
- GET /settings includes setupCompletedAt; GET /auth/me exposes only the completion timestamp alongside its existing safe fields and sends Cache-Control:no-store.
- ProtectedRoute reads /auth/me for authenticated routes before mounting their content. Incomplete accounts are redirected to /setup; /login and /register remain public, /setup remains accessible after authentication. There is no completion cache in localStorage or JWT.
- Incomplete Setup has no skip link. Complete users may revisit Setup and leave without saving.
- Guard loading/error/retry/logout states fail closed. Abort/lifetime/token checks and session-key remount prevent old account responses from unlocking a new session.
- Financial prefill/preservation is unchanged; no completion inference from income, budget, payday, Goals or transaction count.

### Actual AI verification for completion
- Prisma validate/generate PASS; backend/frontend builds PASS (existing bundle warning).
- Migration runner PASS on a fresh isolated database (13 migrations) and an isolated 12->13 upgrade with a legacy user/profile/budget. All SQL checksums match; prior financial fingerprint unchanged; existing/new users start incomplete.
- 23 unit/HTTP/PostgreSQL/notification regression tests PASS on the upgraded isolated database. Includes ordinary save staying incomplete, failed transaction rollback, success, stable completion timestamp on repeated saves and ownership.
- Completion browser API mocks: 6 groups PASS, including 10 direct URLs, public routes, login incomplete/complete, save failure/success, refresh/logout, delayed response during account switch and retry.
- Existing Setup browser: 4 groups PASS; Settings browser: 11 groups PASS.
- Real browser -> backend4005 -> isolated Setup acceptance PostgreSQL PASS with a newly created synthetic account: incomplete direct URL/login, offline save failure, successful persisted completion with null financial fields, no Budget/Goal/Transaction created, refresh/logout/relogin and switching to an existing incomplete account with preserved prefill.
- Migration was also deployed ONLY to the separate Setup acceptance database (now 13). Application database was not connected or migrated. Deploy this migration before running the new backend against any other database.
- Acceptance frontend5181/backend4005 now serve completion-aware code. These are AI results; user acceptance of mandatory Setup is pending.

## Earlier invitation policy — 1 October 2026 (superseded below)
- Setup is invited once on successful login, not a gate for authenticated routes. Overview/menu has no Setup entry. Skip goes to Overview without writing financial data or marking completion. Later editing is in Settings, including financial intention (not a real Goal).
- User.setupPromptedAt is separate from setupCompletedAt; login atomically claims the invitation only when both are null. Concurrent successful logins yield one showSetup:true response. Failed login does not claim it. An interrupted/closed invitation is not shown again. Previously completed users are not invited; existing incomplete accounts get one invitation after deployment.
- Migration 20261001020000_add_setup_prompted_at is new; already-applied completion migration bytes remain unchanged. Application database was not accessed.
- AI: Prisma validate/generate and both builds passed; 14 unit/HTTP/DB regressions passed; first-login browser mock and existing Setup browser mock passed, including skip/relogin, direct routes, session switch, save failure/success, keyboard and 390px. Fresh 14 and upgrade 13->14 migration tests passed with checksums and financial fingerprint preserved.
- Browser test initially crashed because Settings mock omitted goals; fixture now follows API contract. No product change was needed for that failure.
- See the separate user acceptance below for the first-login/skip policy.

- Final follow-up: Settings browser API-mock regression passed (including intention persistence). Acceptance-only migration 14 deployed; frontend http://127.0.0.1:5181 points to backend4005 with /health and /health/db passing. Main application DB was not connected. At that earlier verification, original 26 paths were unchanged, the index was empty and git diff --check passed. User acceptance is recorded separately below.

## User acceptance — separate from AI verification

User acceptance: PASS
Date: 1 October 2026 (Asia/Bangkok) / 1 ตุลาคม 2026
Reported and confirmed by the user, not an automated test result.

- เปิด Setup หลัง login
- ข้ามไปใช้แอปได้
- เปิด Setup ภายหลังจาก Settings (ตามผลตรวจรับที่ผู้ใช้รายงาน)
- บันทึกสำเร็จแล้ว login ครั้งถัดไปไม่วนกลับ /setup

Current Settings entry: the financial section has a visible “เปิดฟอร์ม Setup” button that navigates to /setup, including for accounts that already completed Setup. Opening the form only reads/prefills stored settings; it does not create a Goal or write financial values until Save is pressed.

Unsaved Settings draft: the button displays a warning when the form is dirty and uses the existing useUnsavedSettings confirmation before navigating. Cancel keeps the user in Settings with the draft intact; confirming explicitly discards the unsaved draft and opens Setup with persisted values. There is no automatic save.

AI verification of the follow-up (separate from user acceptance above): Settings browser API-mock assertions passed for Settings -> Setup, completed-account access, matching prefill, unchanged stored values and zero mutation requests when opening. Draft assertions verified that the confirmation appears, Cancel retains the draft and explicit confirmation permits navigation. Settings browser regression and frontend build passed (existing bundle-size warning). These follow-up assertions are AI results, not a new user acceptance claim.

Staged scope: Setup form, login invitation/authenticated route guard, Settings financial-intention/completion contract, two Setup migrations and related tests. Category defaults, transactions limit, other acceptance documents and original local changes are excluded.

## Current mandatory Setup policy

- Ordinary USER accounts with no setupCompletedAt must complete /setup after login and before entering protected pages, including direct URLs and refresh. setupPromptedAt records an earlier invitation only; it is not completion. Login and GET /auth/me use the same requiresSetup helper.
- /setup is a standalone Login/Register-style form without AppLayout/sidebar or a skip action. Logout remains available. Completed members opening /setup go to /overview; ADMIN accounts go to /admin without financial onboarding. The older Settings -> Setup entry consequently redirects completed members to Overview; financial editing remains available in Settings.
- Existing form fields, optional financial values, validation and explicit completeSetup save are preserved. The route guard reads account status only; it adds no financial mutation or new backend financial API permission rule. The destination layout loads the profile after successful completion.
- No schema/migration/backfill or database mutation was performed for this policy change. Existing historical verification and User Acceptance above describe earlier policies, not acceptance of this revision. User Acceptance for this revision has not been recorded.

### Automated verification for this revision
- Backend and frontend builds PASS. Setup requirement/checklist unit tests: 7 PASS.
- Browser with mocked APIs: mandatory-completion suite 4 groups PASS; existing Setup form suite 4 groups PASS; public-home routing suite 3 groups PASS; Guide suite 5 groups PASS. Coverage includes incomplete direct URLs/refresh/repeated login, failed/successful save, completed/Admin routing, logout by keyboard, mobile, draft preservation, duplicate submission and stale session responses.
- Browser checks use synthetic responses, not logins or writes to the application database. The login-invitation PostgreSQL test expectations were updated for mandatory completion but that database suite was not run in this revision.
