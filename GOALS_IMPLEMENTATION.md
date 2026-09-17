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
