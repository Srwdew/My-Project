# Goals implementation — 17 September 2026 (Asia/Bangkok)

## Actual verification

| Layer | Result |
|---|---|
| Preflight | Eight old migration names/files/checksums match; old rollback is followed by successful apply |
| Prisma | format, validate, generate passed with Goals models |
| Migration | Nine migrations apply from empty isolated PostgreSQL database; only new Goals migration subsequently applied to SpendSense |
| Goals unit | Five calculation/validation tests passed |
| Goals real HTTP + PostgreSQL | Twenty scenario subtests passed, with two parent tests; Goals total27 including calculation tests |
| Concurrency | Concurrent CREATE retry; same-key opening/allocate/release retries; distinct-key over-allocation/over-release; allocate vs archive; allocate vs income reduction; two-connection lock contention passed |
| Existing mock/HTTP regression | 22 notification tests passed with Prisma doubles |
| Existing date/report regression | 18 tests passed, including real HTTP/PostgreSQL rollback reconciliation and date helpers |
| Combined test count | 67 passed, 0 failed, 0 skipped (counts include parent tests) |
| Builds | Backend tsc and frontend tsc/Vite passed; frontend bundle-size warning only |
| Browser | Accepted by the user on 17 September 2026 (Asia/Bangkok); not AI browser automation |

Executed command from backend: `node tests/runGoalsDatabase.cjs`. It creates a fresh isolated PostgreSQL database, applies repository migrations and runs Goals tests followed by notification/reconciliation regressions. No existing database is reset or seeded. First test attempt revealed an incorrect test Budget query; fixed to year/month query and reran successfully. All reported pass counts are from the corrected run.

Successful full run database: spendsense_goals_test_1789585324343_1c7f6e. Earlier test databases retained: spendsense_goals_test_1789585062843_713d15 (failed test query), spendsense_goals_test_1789585174716_644099 (23 tests passed before additional races). Test data never inserted into SpendSense.

## Expected / actual examples

| Check | Expected | Actual | Result |
|---|---|---|---|
| Decimal | 0.07+0.01=0.08 | 0.08 | PASS |
| Monthly round-up | 100/3 ->33.34 | 33.34 | PASS |
| Overfund | saved120/target100; bar100 | numeric120.00%; bar100.00%; excess20.00 | PASS |
| FIFO | lots70+30, withdraw85 | releases70+15; saved15 | PASS |
| Reports after allocation | Transaction/Overview/Weekly/Budget unchanged | HTTP responses equal before/after | PASS |
| Concurrent source100, requests80+80 | one201, one409; reserved80 | same | PASS |
| Concurrent release100, requests80+80 | one201, one409; saved20 | same | PASS |
| Delete fully released source | live FK null; owner/originalID/history unchanged | all asserted, complete ledger/operation snapshots equal | PASS |
| Append-only | UPDATE/DELETE all three history tables rejected | PostgreSQL23514 on all six attempts | PASS |
| Foreign source owner | Direct insert rejected | DB trigger rejects | PASS |
| Retry | Identical response, no duplicate rows | asserted for CREATE/ALLOCATE/RELEASE/opening | PASS |

## Current database deployment

Migration: `20260916153000_add_goals_ledger`. Final `prisma migrate status`: database schema up to date,9 migrations.

Before/after deployment fingerprints of all original rows matched:
User4; Profile2; Category13; Transaction15; Budget3; CategoryBudget2; Notification5; BudgetNotificationSetting1.

No applied migration edited; no manual migration-table changes; no financial backfill.

## Files in this task

Added:
- backend/prisma/migrations/20260916153000_add_goals_ledger/migration.sql
- backend/prisma/migrations/20260916153000_add_goals_ledger/.gitattributes
- backend/src/lib/goalCalculations.ts
- backend/src/lib/goalWriteTransaction.ts
- backend/src/lib/goals.ts
- backend/src/routes/goals.ts
- backend/tests/goals.calculations.test.ts
- backend/tests/goals.database.test.ts
- backend/tests/runGoalsDatabase.cjs
- frontend/src/pages/Goals.tsx
- frontend/src/pages/Goals.css
- GOALS_DESIGN.md
- GOALS_IMPLEMENTATION.md

Modified existing workspace files:
- backend/prisma/schema.prisma (Goals models/inverse relations; old fields retained)
- backend/src/index.ts (routes, row-lock and source guards; reconciliation changes preserved)
- backend/tests/notifications.http.test.ts (Prisma double supports new transaction protocol; original assertions retained)
- frontend/src/App.tsx (replace Goals placeholder)
- frontend/src/components/Sidebar.css (shared mobile navigation)
- frontend/src/components/Applayout.css (mobile content margin)
- SpendSense_PROJECT_CONTEXT.md (handoff append only)

Unrelated package/lockfiles, config, old migrations, other frontend pages/utilities and reconciliation work are excluded from the Goals commit. The baseline commit before Goals is e806b56. No push.

## Browser acceptance ? passed by the user on 17 September 2026

1. Open /goals, verify shared header/bell, card two-column desktop and one-column narrow layout; no annotation borders.
2. Toggle actual list/card; reload; switch accounts and verify separate view preferences/data.
3. Create/edit with optional dates/plans, validate positive money, zero-saved label and completed/overdue/overfunded states.
4. Set opening cutoff/note, allocate from opening or an eligible income, inspect history and monthly requirement.
5. Release across lots; correct an allocation; verify ledger history remains readable.
6. Archive blocks new allocation but allows release; restore works; status/archive filters and load-more work together.
7. Edit/delete a reserved income from Transaction page: readable409; after full release deletion succeeds and Goals history remains.
8. Test loading/network errors/retry, native dialog focus/Tab/Escape and mobile shared navigation.
9. Existing reconciliation browser acceptance (percentage/date label/refresh) is still separately pending.

Service ports checked before startup; backend4000 and frontend5173 started once for review. Browser acceptance was subsequently confirmed by the user on 17 September 2026; no AI browser automation is claimed.

## Final acceptance and commit verification ? 17 September 2026

- User confirmed Goals browser acceptance passed. This is distinct from AI automated tests.
- Final rerun: Goals27 + regression40 =67 passed, zero failures/skips. Backend/frontend builds passed; Vite bundle warning remains.
- Final isolated test database: spendsense_goals_test_1789587157958_4248e9. It is external PostgreSQL test data, not a repository artifact or commit input.
- Read-only migrate status:9 migrations, up to date. No migration deployment was run on SpendSense during closeout.
- Commit scope:20 explicitly selected paths. Reconciliation percentage changes in backend/src/index.ts and its handoff section are excluded through partial staging; workspace contents are preserved.
- schema.prisma and App.tsx contain pre-existing uncommitted foundations required by Goals; these authorized integration files are included whole. Shared navigation CSS files were previously untracked and are included whole. No other old source, dependency/config files or old migrations are bundled.
- Consequently tests/builds describe the complete current workspace; this commit alone is not a claim of a reproducible clean checkout while prerequisite files remain outside Git.
- No .env, credential material, node_modules, dist, logs, database dumps or test database files are included. Test source code/runner are intentionally included.

Migration byte preservation: Git autocrlf initially normalized the staged SQL and changed its checksum. A migration-local .gitattributes sets migration.sql -text; the committed blob is checked byte-for-byte against the applied file. The already-applied trailing blank line is intentionally preserved rather than edited.


## Cash-flow feasibility — last-completed-calendar-month-v1
User decision in this conversation: use the most recent fully completed calendar month, in Asia/Bangkok. The thesis requires comparing required monthly savings with actual net cash flow but does not specify this reference period; the period is an approved design policy, not a quoted thesis rule.

Existing GET /goals and GET /goals/:id include feasibility. Required monthly amount retains the existing remaining amount / inclusive remaining calendar months calculation, rounded upward to cents. Actual cash flow is the authenticated user's recorded income minus expense for the complete reference month, aggregated in PostgreSQL. Both Goal ledger totals and cash flow are read inside the existing RepeatableRead snapshot. No new endpoint/schema/migration is required.

States distinguish archived/completed/overdue/no target date/no transactions/no income/non-positive cash flow and required savings above/within observed cash flow. The UI shows the exact reference month, income, expense, net amount and limitations. Each Goal is assessed separately; the same cash flow is not a shared allocation promise. Data completeness or future income is not assumed, and no Goal, Budget, Transaction or ledger write results from assessment. Browser refreshes on date change, focus and data-change events.

AI tests cover month/year/leap boundaries, Decimal rounding, missing data, negative net cash flow, authenticated ownership, unchanged Transaction/Goal/ledger snapshots, UI states/retry and mobile layout. Synthetic isolated PostgreSQL and API doubles only; User Acceptance for this addition: PASS, confirmed by the user in this conversation.


## Goal Feasibility — User Acceptance: PASS
ผู้ใช้ยืนยันในบทสนทนานี้ว่า Goal Feasibility ผ่าน User Acceptance แล้ว โดยช่วงอ้างอิงที่ผู้ใช้เลือกคือเดือนปฏิทินเต็มล่าสุดที่จบแล้ว บันทึกการตรวจรับนี้แยกจากผล automated/AI tests ข้างต้น ไม่เติมวันที่ เวลา ตัวเลขผลตรวจ หรือรายละเอียดกรณีทดสอบที่ผู้ใช้ไม่ได้รายงาน

## Goals / Budget / Forecast — backend-only scope (13 October 2026)

The user superseded the latest UI integration: evaluation belongs in the backend only. No new planning section, simulation form, warning banner or component remains on the frontend. Earlier Goal Feasibility UI, its last-completed-calendar-month policy, and its previously confirmed User Acceptance are unchanged. No User Acceptance is claimed for this backend addition.

### Retained backend calculation
- `goalSavingsPlan.ts` retains Decimal-based total monthly planning: configured Profile.income minus current-month Budget.amount, without adding category budgets; sum existing calculateGoal requirements across non-archived, not-yet-funded goals. Remaining calendar months are inclusive; each requirement rounds upward to cents.
- No configured income/budget is null rather than zero. Zero/negative available savings is preserved. No active goals, undated or overdue unfunded goals cannot silently produce a passing overall assessment.
- A negative difference produces the amount missing per month and separate budget-reduction/income-increase alternatives. A reduction exceeding the entire budget is explicitly insufficient. Constant income/budget assumptions are not guaranteed savings or success probabilities.
- `goalForecastSignal.ts` moved from frontend to backend. It consumes the existing Holt result without changing the model. Null/unavailable/stale or mismatched periods/budget suppress conclusions; only dates within the current budget month contribute to the short-term signal. Forecast is never counted as actual expense or used to change goals, budgets or allocations.
- `assessSavingsPlan(tx, trustedUserId, today, assumptions)` is an internal service, combining plan, actual previous-month cash flow, and the separate forecast signal. Callers must supply trusted account scope and a RepeatableRead transaction (as exercised by integration tests). Assumptions are validated and foreign/inactive goal overrides rejected. It performs reads/calculations only; it creates no ledger/operation records.
- The subsequent backend-only integration below invokes this service from the existing read endpoints. It remains absent from frontend rendering, scheduled jobs and write flows. Existing fields and financial behavior are preserved.

### Removed latest UI-only integration
- Removed only the new GoalsPlanning import/render hunks in Goals.tsx, retaining all prior local edits.
- Removed GoalsPlanning.tsx/.css, the frontend goalForecastSignal.ts (backend replacement retained), and goalSavingsPlan.browser.cjs that existed solely for the removed UI.
- Removed GET /goals/plan and POST /goals/plan/preview: their only production caller was the withdrawn UI. Preserved the backend calculation, validated assumptions and backend tests instead of keeping unused UI endpoints.
- Existing cash-flow feasibility, authentication/ownership, write idempotency, ledger rules, session protection, styles and motion remain unchanged. No schema, migration or dependency change; no application/production or UAT data access in this revision.
- The prior UI-integration test results belong to that superseded implementation and are not presented as current UI acceptance.

### Verification for the preceding UI-removal step
- Isolated PostgreSQL tests: 20 passed, 0 failed, about 6.73 seconds (includes parent test). Verified database `spendsense_goals_plan_test_1791905940458` in a new test-only container, localhost port 56546. Applied the 21 existing migrations only to that fresh database; status up to date. Existing databases and data were untouched.
- Tests exercise formulas, Decimal/month/leap boundaries, scoped reads, missing values, repeated assumptions, invalid foreign IDs, unchanged financial records, and absence of the UI-specific routes/new fields in the original HTTP response.
- Existing goalIntention browser regression passed with synthetic API fixtures, plus in-memory assertions that Goals has no planning component and makes no planning/Forecast requests. Includes create-confirmation, mobile, retry and late-session checks. No existing browser-test file was changed.
- Frontend build passed; Goals JS 26.63 kB (gzip 7.62 kB), CSS 6.13 kB (gzip 1.80 kB).
- Backend build initially caught nullable type differences when moving the helper; its contract and null guard were corrected without modifying Holt.
- No live UAT/backend service restart was performed in this revision. Source/build and isolated tests reflect the removed routes; an already-running non-watch process requires its normal restart before its in-memory routes change.

- Final backend build passed after the nullable-contract correction; the 7 focused calculation/signal unit tests passed again. Git diff --check passed. SHA-256 comparison confirms every frontend file matches the pre-integration baseline, and goals.ts routes match their pre-integration bytes. All earlier local changes, HEAD and index are preserved; no staging/commit/push.

## Backend-only integration into existing read endpoints — 13 October 2026

Current flow: GET /goals and GET /goals/:id call assessSavingsPlan inside their existing RepeatableRead transaction. It calls the retained goalSavingsPlan calculation and backend goalForecastSignal. No new routes, no reintroduction of /goals/plan or /goals/plan/preview, and no frontend edits.

Both responses add one nested field, assessment:
- scope: all_active_goals — account-wide active/unfunded goal totals, even on the detail endpoint or a filtered/paginated list.
- plan: configured income/current total budget, per-goal requirements, sum, difference, reason codes and alternatives under the approved constant-monthly assumptions.
- cashFlow: actual last completed calendar month, also reused by the unchanged per-goal feasibility field.
- forecastSignal: reason, nullable amount and endDate. A positive amount only describes excess over the short-term reference allowance; unavailable/stale/no-budget/period mismatch retain null, never zero. The helper now verifies the seven-day end date and comparedDays (limited by month end), as well as asOfDate/start/month/budget. Holt and its formulas remain untouched.

Existing data, nextCursor, asOfDate, goal detail fields and feasibility are preserved. The existing frontend ignores the additional field. Detail lookup enforces ownership before assessment; every underlying query is scoped to the authenticated user. No query/body parameter can select another account or inject simulation assumptions into these read endpoints. Cash flow, Goal/ledger state, profile, budget and forecast inputs share the same database snapshot. No writes, GoalOperations or notifications are produced.

Automated results for this integration (synthetic only; no new User Acceptance claimed):
- 25 backend/unit/PostgreSQL tests passed, 0 failed, approximately 13.09 seconds including parent tests.
- HTTP coverage: endpoint output, multiple-goal totals independent of pagination/filter, preserved actual cash flow, missing income/budget, negative available savings, undated/overdue Goals, cross-account detail rejection and account-isolated totals, Forecast unavailable/available/stale, unchanged financial/ledger/notification rows.
- Real PostgreSQL concurrency test pauses an actual snapshot read, commits synthetic profile/budget/goal changes on another connection, and verifies the in-flight response still contains the old consistent values; the following request sees the new values.
- Pure signal tests cover period/horizon/compared-day mismatches and leap-month crossing; the endpoint itself supplies matching date/budget inputs from one snapshot.
- New goalAssessment.browser.cjs runs the original goalIntention regression with synthetic API responses and verifies that adding assessment leaves the entire Goals DOM identical. Original create-confirmation, retry, mobile and session-switch checks pass; no new plan or Forecast requests are made by the UI.
- Backend and frontend builds passed. Frontend Goals remains 26.63 kB JS (gzip 7.62 kB) and 6.13 kB CSS (gzip 1.80 kB).
- Isolated database spendsense_goals_plan_test_1791907640402, localhost port 64451, new test-only container. Name verified before applying the 21 existing migrations; migration status up to date. No application/production/UAT connection or UAT backend restart.
- Existing UI-removal verification above describes the preceding step, not this new additive API response. Historical User Acceptance remains limited to the previously accepted feature.
