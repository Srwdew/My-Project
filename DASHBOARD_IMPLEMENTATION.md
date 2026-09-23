# Monthly Dashboard implementation — 19 กันยายน 2026 (Asia/Bangkok)

## Scope and actual implementation
/overview?month=YYYY-MM is now the monthly Dashboard, inside the existing AppLayout/Sidebar/UserHeader/NotificationBell. Added GET /dashboard. No Analysis/Data Readiness, forecasting, anomaly, behavior score, migration, dependency or financial backfill. GET /overview and GET /overview/weekly remain unchanged.

Four cards: actual income, actual expense, net cash flow and total budget remaining. Categories include all expense categories, irrespective of category budgets. SVG daily bars have an accessible keyboard-openable table with all calendar dates. Latest five transactions link to /transactions?month=YYYY-MM. Goals explicitly show current status rather than a historical snapshot.

## Period, auth and response contract
- GET /dashboard accepts only optional month; malformed, repeated, unknown parameters (including userId) and future months return400. Missing month uses Bangkok current month. Unauthenticated returns401; private,no-store. Error messages do not disclose internal details.
- Capture bangkokToday() once per request. Pass that asOfDate through period and every Goal calculation; all queries use a RepeatableRead transaction.
- Dates stay UTC surrogate. Current month covers first day through asOfDate; historical month covers its calendar end. Daily timestamps are serialized as YYYY-MM-DD without local timezone conversion.
- month, timezone, asOfDate; period {month,startDate,calendarEndDate,effectiveEndDate,isCurrentMonth}.
- summary {transactionCount,incomeTransactionCount,expenseTransactionCount,incomeAmount,expenseAmount,netCashFlow,budgetAmount,budgetRemaining,budgetExceeded,hasTransactions}.
- expenseCategories [{categoryId,categoryName,transactionCount,amount,percentage}], sorted amount descending then categoryId. Percentages rounded HALF_UP to2decimals and can sum to99.99/100.01.
- daily [{date,transactionCount,incomeAmount,expenseAmount}] sends only recorded dates, ascending.
- recentTransactions {limit:5,hasMore,items:[{id,date,time,type,amount,categoryId,categoryName,description}]}; deterministic transactionDate DESC, createdAt DESC, id DESC. No time-based tie ambiguity.
- goals {scope:current,asOfDate,activeCount,notStartedCount,overdueCount,allocatedAmount,allocationScope:all_goals_including_archived,primaryGoal}. primaryGoal null or {id,name,archivedAt,calculatedStatus,targetAmount,savedAmount,remainingAmount,progressPercent,progressBarPercent}.
- All money is Decimal on backend and serialized as two-decimal strings. Percentages are strings. Frontend money formatting uses BigInt integer formatting plus original cents, including values beyond Number.MAX_SAFE_INTEGER. Number conversions are only for SVG heights/bar widths, not money arithmetic or labels.

## Financial invariants
Income/expense are PostgreSQL sums of Transaction.amount with matching auth userId/type/date. Net = income - expense. BudgetAmount comes exclusively from Budget(userId,year,month); remaining=budget-expense with negative retained and clear exceeded label. No Budget row yields null/null, not0. CategoryBudget never adds to the total budget.

Profile.income, opening funds, allocations, releases, corrections and opening revisions do not enter Transaction totals. Cash flow is not a bank balance.

Canonical Goals net is shared by existing goalSaved and Dashboard via netGoalAllocation in goalAllocation.ts. Existing Goals correction writes compensating RELEASE and optional replacement ALLOCATE ledger entries; all of those entries remain included in grouped sums. Dashboard does not independently interpret GoalOperation.kind or ignore corrections. Existing calculatedStatus logic in calculateGoal is reused. Only nonarchived Goals count toward active/not_started/overdue; allocatedAmount includes every Goal including completed/archived. Primary goal remains visible as archived rather than silently replaced.

Tests verify actual correction with and without replacement, release, opening revision, archive and equality with GET /goals/:id while monthly transaction reports remain byte-equivalent at the response level.

## UI and empty states
Current month forward button disabled. Invalid/future URL month shows error without fetching another month silently. URL navigation remounts data by month/session; AbortController + active flag + current-token equality prevent old results/errors overriding the current account. Bangkok date refreshes on focus/every30seconds, so midnight refreshes current-month range.

No records: explicit empty message, zero from recorded transactions is not a claim that actual activity was zero, no flat invented graph. Missing date within the elapsed month: no recorded transactions; future date: not reached; recorded date with income or expense side0 displays0.00 for that side. Null budget means not configured. Long strings wrap; responsive4/2/1card columns,2/1content columns, table scrolling isolated to table region. Keyboard/screen-reader table gives exact money behind chart.

## History filter and removed old UI
GET /transactions?month=YYYY-MM adds user/date predicates to the database findMany. Without month it retains the original all-account-history query and response contract. History reads month from URL; in month mode shows all filtered groups, with a clear-month link. Without month preserves latest3transaction-days display and existing show-all/search behavior. Session/month remount and cancellation guards added; load errors have retry.

WeeklyExpenses.tsx and WeeklyExpenses.css deleted after reference search confirmed Overview was their only caller. Free-range selectors no longer rendered. utils/overviewPeriod.ts retained deliberately only for the existing reconciliation.frontend.test.ts historical date-range regression cases, since legacy overview/weekly API contracts are still supported; it has no runtime import into the monthly Dashboard bundle. No other page's component removed.

## Real SQL / memory behavior
Captured Prisma query events from a real PostgreSQL client running dashboardView in RepeatableRead:
- Transaction: 3 GROUP BY queries (type; category; date/type), each includes userId and bounded transactionDate predicates.
- Transaction: 1 latest-items SELECT with LIMIT5, same user/month predicates and deterministic ordering.
- GoalLedgerEntry: 1 user-scoped GROUP BY goalId/kind, no full-row ledger fetch.
- Goal metadata is selected for this user's Goals; Profile selects primaryGoalId only; category labels fetched for aggregated IDs only.

Thus memory is proportional to days/categories/Goals plus5recent items rather than all account transactions/ledger rows. Goal metadata and grouped per-goal totals still scale with number of Goals. No new index/migration is justified by the current evidence; this is functional query-shape verification, not a large-production-dataset benchmark.

## AI verification actually run
| Layer | Result |
|---|---|
| Prisma validate/generate | Passed, no schema or migration changes |
| Backend/frontend build | Passed; existing >500kB frontend bundle warning remains |
| Dashboard unit/frontend utility | 5passed |
| Dashboard HTTP/PostgreSQL/query integration | 8subtests + parent =9passed |
| Existing Settings/Goals/notifications/reconciliation | 77passed |
| Combined Node runner | 91passed,0failed,0skipped |
| Chrome headless API-double | 8groups passed: desktop/current-month/negative-budget/exact large money, keyboard daily table, month race, retry, session race, mobile overflow, History month and legacy links, empty/no-budget |

Real isolated DB: spendsense_goals_test_1789833798997_d671c4, existing10migration chain applied to newly created test database by runner. No production fixtures, reset/drop, db push, or changes to applied SQL. Tests include future-row defensive fixture only in the isolated database; no new feature accepts future transactions.

Commands: backend Prisma validate/generate and npm run build; frontend npm run build; backend node tests/runDashboardDatabase.cjs with DATABASE_URL injected for an isolated admin DB named spendsense_goals_test_*; root node backend/tests/dashboard.browser.cjs. Runner refuses other admin DB names and sets GOALS_TEST_DATABASE for tests. Runtime logs in .git/settings-verification/dashboard-tests.log are not source or commit candidates.

The review caught a broad patch also adding month validation to POST /transactions; it was removed before final verification. Final diff modifies only GET for the filter; no POST CRUD change remains. Final tests and builds were rerun afterward.

## Browser acceptance — passed by user, 20 September 2026
The user confirmed Dashboard and History month filter browser acceptance passed on 20 September 2026 (Asia/Bangkok). This is separate from AI Chrome API-double tests. Acceptance checklist:
- Current/prior month, URL reload/back/forward, disabled next month and invalid/future URLs.
- Compare income/expense/cash flow and category/day sums with real History for the same month; Budget matches total budget, including unset/equal/exceeded states.
- Latest5 links to correct History month; clear-month restores old history behavior.
- Opening/allocation/release/correction affect Goals display only; main Goal settings/archived state; current Goals stay current while switching historical months.
- Empty month, income-only/expense-only, missing dates versus future dates; no fabricated zero graph.
- Keyboard month controls/table/retry and real device mobile/long text; login/logout/switch account and rapid month changes.

Browser acceptance passed by user; closing out only Dashboard files, without push. Existing local .env.example, docker-compose port, root package/lock, App.css, seed and5placeholders preserved outside this work.

## Files
Added: backend/src/lib/dashboard.ts; backend/src/lib/goalAllocation.ts; backend/src/routes/dashboard.ts; backend/tests/dashboard.test.ts; backend/tests/dashboard.database.test.ts; backend/tests/dashboard.browser.cjs; backend/tests/runDashboardDatabase.cjs; frontend/src/components/DashboardDaily.tsx; frontend/src/utils/dashboard.ts; DASHBOARD_IMPLEMENTATION.md.
Modified: backend/src/index.ts; backend/src/lib/goals.ts; frontend/src/pages/Overview.tsx; frontend/src/pages/Overview.css; frontend/src/pages/Transactionhistory.tsx; SpendSense_PROJECT_CONTEXT.md.
Deleted: frontend/src/components/WeeklyExpenses.tsx; frontend/src/components/WeeklyExpenses.css.
## Staged-candidate closeout — 23 September 2026
Exported the staged index to an isolated directory under .git and verified all329tracked files matched index blobs before testing. Installed backend/frontend dependencies with npm ci from candidate lockfiles; no workspace source/config/dependency copies or .env files were used. Injected runtime environment only for an isolated test database.
Prisma validate/generate, backend TypeScript build and frontend build passed from the candidate. Dashboard14 + regression77 =91tests passed,0fail/skip, on spendsense_goals_test_1789841861080_f7ac97. Chrome8API-double groups passed against the candidate's built frontend served on temporary port5174. This is separate from browser acceptance confirmed by the user on20September2026.
Only acceptance/verification documentation was updated after code-candidate verification. Staged18paths include no environment files, credentials, screenshots, logs, node_modules or dist. Existing local changes remain outside this commit. No push.
Known dependency audit result from npm ci: backend6vulnerabilities (1moderate,5high), frontend0; dependency graph unchanged in this work. Frontend bundle warning >500kB remains. No automatic audit fix or dependency upgrade performed.