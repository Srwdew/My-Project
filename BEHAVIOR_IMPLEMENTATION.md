# Behavior implementation — 26 กันยายน 2026 (Asia/Bangkok)

## Status and approved scope
Implemented /behavior and GET /behavior, linked from existing Sidebar and Dashboard. Uses AppLayout, UserHeader and NotificationBell. No Analysis/Data Readiness page, notification producer, schema/migration/dependency addition. No stage/commit/push.
Mapping to the book is based on the user's supplied requirements for 2.2.2.6, the Behavior analysis method and 5.3.1–5.3.2. The full original figures were not inspected; no pixel-match or independent full-book audit claim.

## Period, sources and API
GET /behavior?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&categoryId=<uuid|uncategorized>
All parameters optional only when both dates omitted (defaults to last 30 full days). Supplied dates must both be present and valid; duplicates/unknown parameters rejected. Max 366 inclusive days. End <= Bangkok yesterday. Prior period starts D days before current start, ends the day before; same D days, no overlap. Dates are UTC surrogate, time is confirmed Bangkok wall-clock. asOfDate captured once per request.
Auth userId only; 401 invalid auth, 400 invalid query, 500 generic read failure. private,no-store. RepeatableRead snapshot then Decimal calculation outside transaction.
Source is actual expense, including pending/flagged/confirmed_problem transactions still present. No Profile income, Goals money, forecast, or Anomaly baseline filtering.
Category left join and COALESCE fallback group missing/orphan categories as ไม่ระบุหมวด. Current schema requires categoryId with FK: no constraint loosened, no orphan test row inserted. Fallback calculation tested with synthetic null-category rows; PostgreSQL query shape verifies LEFT JOIN and tests show invalid FK rejected.

## Readiness and facts
Each filtered period separately needs >=30 expense rows AND inclusive firstExpenseDate..lastExpenseDate >=30 days. Not 30 distinct days and not simply a selected range of 30 days.
Return count/span/distinct days/reasons. Not a completeness or statistical-significance claim.
Facts remain visible for insufficient periods. If either period not ready ALL comparison objects are null (summary/category/weekday) and no comparison finding. Individual period facts, shares and current-only time findings can remain when their own gates pass.
E=sum(amount), N=count, A=E/N if N>0 else null. Category share=Ec/E*100 else null.
Difference=now-before; change%=difference/before*100 else null for zero base. Share change is percentage points, calculated before display rounding. Decimal precision40 HALF_UP; API money/percent strings, counts integers.
No-record dates have hasExpenseRecords=false, never described as confirmed zero. Graph aligns dayIndex 1..D with actual date pairs retained in keyboard-accessible table. Prior graph overlay hidden when comparison not ready.

## Weekday and time
Weekday facts include calendarOccurrences in each period, recordedDays, amount and amount/calendarOccurrences. Missing dates affect recorded-average denominator, with explicit incomplete-recording warning; no weekday superiority claim from total alone.
Time uses only transactionTimeConfirmed=true AND transactionTime nonnull. Six 4-hour buckets; coverage=confirmed expense count/all expense count. Includes excluded count and reasons for each period.
Current time finding requires main readiness, >=30 confirmed rows, >=80% coverage, bucket count >=50% of confirmed count and >=5 distinct dates. Thresholds are v1 descriptive policy, not an accuracy guarantee. No createdAt inference.

## Findings and recommendations
Compare per category only when BOTH periods ready and category has >=5 rows on >=3 dates in EACH period.
- Amount up + count up + exact average not up: consider reviewing frequency.
- Amount up + average up + count not up: consider reviewing transaction values.
- Amount, count and average all up: review both.
- Amount and share up: merge evidence/advice into same category finding, no duplicate headline.
Equality not treated as increase; average comparison uses cross multiplication, not rounded values. Sort category findings by amount increase then category ID; time and recurrence observations follow. Show first3 with remaining findings expandable.
Evidence includes both metrics/period comparison and rule IDs. Suggestions are conditional and do not assert cause, motivation, fraud or overspending without a budget comparison.
Version contains all configurable thresholds/policies in server constants hashed into behavior-v1-*.

## Strict possible recurrence
Within CURRENT period group same category+exact amount+date. At least3 distinct dates, exactly1 row per date in candidate group.
Require all consecutive gaps exactly7 days OR consecutive calendar months with same day-of-month OR all month ends (supports leap day).
Duplicate same-amount/category rows on one date suppress cadence inference. Missing/shifted dates and changed amounts can produce false negatives; never called bill/subscription.
Only expose candidates when current readiness passes. SQL filters strict matches, orders by count desc/category/amount, LIMIT51; return first50 and hasMore. Never claim this is all recurring costs. No future transaction or recurring-plan creation.

## PostgreSQL query evidence / bounded memory
Real SQL tests capture 3 user/expense/date-bounded aggregate queries:
1. category/date/confirmed-time-bucket SUM + COUNT.
2. scope-local category labels/options across both periods.
3. recurrence daily groups + LAG + HAVING cadence guards + LIMIT51.
No full transaction/history/Goal ledger/AnomalyReview row reads. Current category filter applied in SQL for facts/recurrence; options intentionally include observed categories of this user's two periods so filters can be changed.
Memory scales with day/category/bucket aggregates and <=51 recurrence candidates, not raw transactions. No production-scale latency benchmark; aggregates still grow with categories and query scans are bounded by chosen periods (up to732 days total).

## UI and race handling
Separate /behavior with date range/category form, factual summary/KPIs, ordinal daily graph + table, category comparisons, weekday occurrence denominators, confirmed-time coverage, possible recurrence, findings/evidence/recommendations.
Loading/empty/error/retry, responsive tables, long labels/money, keyboard details/selects, explanations beside readiness. React session/day/query keys + active/AbortController/token guards prevent old scope/session responses. Same-scope refresh keeps data/DOM and indicates loading.

## Verification actually run by AI
- Prisma validate/generate: PASS (non-connecting validation URL).
- Backend and frontend builds: PASS. Existing frontend bundle >500kB warning remains (about584kB); no dependency update.
- 158/158 tests, 0 fail/skip: 22 Behavior tests including parent (13 calculation + PostgreSQL/HTTP parent with8 scenarios), existing136 Forecast/backtest/Dashboard/Goals/Settings/Anomaly/Review/Notifications/Reconciliation regression.
- Separate new test database applied 12 existing migrations; no application database writes/reset/drop. Synthetic accounts/fixtures only. Detailed runtime logs retained under .git/settings-verification, excluded from Git.
- Behavior browser API mocks: 9 groups PASS (readiness, missing data, ordinal dates, keyboard table/retry, category/date deferred response, session isolation, mobile). Forecast, Dashboard (10 controlled month races), Anomaly, Review and Settings suites also PASS.
- Early browser failures: PowerShell pipe encoding corrupted Thai strings in newly written test and added links; corrected UTF-8. Then harness category ID variable was shadowed by Chrome protocol counter, yielding no category query. Diagnostic request proved wrong mock selection; renamed variable and asserted selection before submit. No assertion weakened, no random sleep, no product race found.
- Existing local AnomalyReview concurrency observer fix was used by workspace regression, left unchanged and outside this work.

## User acceptance still required
AI browser tests above use API mocks, not real-backend browser acceptance.
Use an isolated acceptance database/account to verify:
1. 29/30 count and29/30 span; either period insufficient hides comparison, facts remain.
2. Custom ranges/category and exact equal-length prior dates; today disabled.
3. Weekday occurrence counts, daily ordinal alignment and missing-record labels.
4. Confirmed/unconfirmed time coverage and reasons.
5. Weekly/monthly/end-of-month recurrence, ambiguous duplicate dates.
6. Evidence/advice accuracy, CRUD refresh, mobile, keyboard/retry and session switch.
No user acceptance claim recorded yet.

## Files
Added: backend/src/lib/behavior.ts, behaviorRules.ts; backend/src/routes/behavior.ts; backend/tests/behavior.test.ts, behavior.database.test.ts, behavior.browser.cjs, runBehaviorDatabase.cjs; frontend/src/pages/Behavior.tsx, Behavior.css; BEHAVIOR_IMPLEMENTATION.md.
Modified: backend/src/index.ts (mount only); frontend/src/App.tsx (route only); frontend/src/components/Sidebar.tsx (link only); frontend/src/pages/Overview.tsx (link only); SpendSense_PROJECT_CONTEXT.md (handoff).
Preserved all12 preexisting local paths, including AnomalyReview test fix, .env.example, compose port, App.css, root package/lock, seed and5 placeholders. No credential/seed contents inspected for this work; environment injected privately only for isolated DB test connections.

## Behavior layout and automatic filters - 27 September 2026

Updated the page using docs/mockups/Behavior Analysis.png: navy evidence summary, four KPI strip, chart and category table, findings and evidence-linked advice. Red annotation frames and sample claims from the image are not reproduced. Existing shared layout/header/bell/navigation retained.

There is one control group and one report. No analysis form/submit button. Entry, valid date/category changes, transaction-data event and window focus fetch automatically. Default is 30 complete Bangkok days through yesterday; 7/30/90-day presets and custom range are available. Category changes preserve URL dates; refresh restores URL filters. Session key, AbortController, active flag and query-tagged response prevent stale scope/account data. Invalid custom dates show validation without submitting an invalid query.

Backend rules/source/schema/dependencies were not changed in this layout revision. Equal prior periods, 30 transaction/30-day span readiness, hidden unready comparisons, confirmed-time coverage, recurrence rules and inclusion of flagged/reviewed expenses are preserved. Missing-record days use markers rather than invented zero observations. Additional readiness/time/weekday/recurrence evidence remains accessible below the main sections.

Verification actually run for this revision:
- Backend/frontend builds PASS; existing bundle >500 kB warning remains.
- 158/158 calculation/HTTP/PostgreSQL/regression tests PASS, zero failures, on a newly created isolated test database with 12 existing migrations.
- Behavior Chrome API-mock regression: 9 groups PASS, including automatic dates/categories, deferred old responses, account switch, keyboard retry and mobile long-text containment. Initial harness failure expected the old empty-state wording; assertion updated to the new equivalent message, without relaxing empty-graph behavior.
- Real Chrome -> frontend 5178 -> backend 4003 -> isolated Behavior acceptance database: automatic category changes, retained URL dates/reload, readiness boundaries, reviewed expense inclusion, keyboard table, offline/error/retry, mobile, account switch PASS. All observed API calls used 4003.
- Actual temporary acceptance CRUD: 3000.00 -> 3111.11 -> 3222.22 -> 3000.00. Data-change/focus events refreshed the same report automatically. Only the newly created temporary transaction was removed; existing fixtures preserved. No application database writes.
- Before/after desktop and after-mobile screenshots kept outside repository in the private acceptance directory, not Git.
- This is AI-run real-backend browser verification; user acceptance was pending at that time and subsequently passed on 27 September 2026 (see separate user acceptance below).

Acceptance URL: http://127.0.0.1:5178/behavior?startDate=2026-08-27&endDate=2026-09-25
Primary account: behavior.primary@example.test; secondary: behavior.secondary@example.test. Credentials remain in the private local acceptance file, not this document. Existing private acceptance instructions that mention pressing Analyze are superseded: changing filters now fetches automatically.

Files touched by this layout revision: frontend/src/pages/Behavior.tsx, Behavior.css, backend/tests/behavior.browser.cjs, BEHAVIOR_IMPLEMENTATION.md, SpendSense_PROJECT_CONTEXT.md. Other uncommitted Behavior implementation remains as before. No stage/commit/push.

Additional browser regression: Dashboard PASS (including 10 controlled month races); Forecast PASS (6 groups), with SETTINGS_BROWSER_ORIGIN explicitly set to preview 5177. Initial Dashboard invocation used its obsolete default port 5173 and timed out; no product code was changed to address that harness configuration.

## User browser acceptance — 27 กันยายน 2026 (Asia/Bangkok)
ผู้ใช้ยืนยันว่าตรวจรับหน้า Behavior แบบใหม่ผ่านแล้ว เมื่อวันที่ 27 กันยายน 2026 (Asia/Bangkok) ผลนี้เป็นการตรวจรับโดยผู้ใช้ แยกจาก automated tests, API mocks และ real-backend browser tests ที่ AI รันและบันทึกไว้ก่อนหน้า ไม่ใช่การรัน tests ใหม่ในรอบบันทึกนี้
สถานะนี้แทนข้อความก่อนหน้าที่ระบุว่ายังรอผู้ใช้ตรวจรับหน้าแบบใหม่ โดยไม่เปลี่ยนผลหรือขอบเขตการทดสอบของ AI ไม่มีการอ้างว่าผู้ใช้ได้ตรวจกรณีเพิ่มเติมนอกเหนือจากที่ยืนยัน
รอบนี้ตรวจ repository/diff เพื่อเสนอรายการไฟล์สำหรับ commit เท่านั้น ยังไม่ stage, commit หรือ push และคงไฟล์ local เดิมทั้ง 12 ไฟล์ไว้

## Approved optional event-time policy — audit 10 October 2026

The user approved keeping event time optional without adding a confirmation checkbox. Do not substitute transaction creation/save timestamps for event time, infer confirmation from OCR, or backfill confirmation on existing records. Missing/unconfirmed event time does not exclude an otherwise eligible expense from amount, category or transaction-date analysis.

Current creation flow intentionally sends `transactionTimeConfirmed=false`, including manually entered time, applied OCR suggestions and pending-request retries. Applying OCR suggestions or submitting the transaction does not confirm its event time. The existing Edit Transaction confirmation control remains unchanged; this decision does not add a new control. Changing the date/time in that edit flow clears confirmation.

Time analysis uses only `transactionTimeConfirmed=true` with non-null `transactionTime`. Behavior and Anomaly retain their separate existing readiness/scoring policies. Insufficient confirmed-time data retains the existing reason/status instead of producing a time finding or flag. Behavior may still display factual bucket counts and coverage with those reasons; this is not a readiness-qualified finding.

Source checked: `frontend/src/pages/Addtransaction.tsx`, `EditTransaction.tsx`, `frontend/src/lib/pendingTransaction.ts`, `backend/src/lib/behavior.ts`, `anomaly.ts`, `anomalyRules.ts` and the existing `transaction_time_confirmed_check` constraint. No source, UI, scoring, readiness, schema, migration or historical-record change was required.

Automated verification (separate from user acceptance): 68 tests passed as reported by Node across behavior.database (10), anomaly.database (12), behavior unit (30), anomaly unit (6), anomalyDimensions unit (5), and pendingTransaction unit (5). Counts include parent tests. The Behavior 732-day performance, HTTP snapshot and 50/51 recurrence cases were excluded from this focused run; no claim is made that they ran here. Database checks cover confirmed-null rejection, exact time-bucket boundaries, omission of unconfirmed time while preserving expense totals, default-false/no-backfill behavior and confirmed wall-clock use rather than createdAt.

Only fresh isolated PostgreSQL resources were used: container `spendsense-reset-test-1791626416406-7fef43`, localhost port 49232, databases `spendsense_goals_test_1791626416406_7fef43_0` through `_5`. Each had 21 completed migrations and no pending migration. Tests ran from a temporary directory with a nonexistent dotenv path; application credentials/.env were not read and the application database was not accessed. Test resources were retained. No new browser acceptance or build was performed for this documentation-only audit.

## Behavior v2 — approved recurrence criteria (supersedes v1 recurrence above)

User-approved rules:
- Keep the existing per-selected-scope Global Readiness: expense count >=30 and inclusive first-to-last transaction-date span >=30 days in the current selected period. Category filters still recalculate readiness as before. No today/future data.
- Scan every rolling window contained in the selected period, not just the latest window. No reads outside that period to make recurrence qualify.
- General: at least 5 distinct dates within 30 inclusive calendar days; multiple transactions on one date count as one date.
- Weekly: at least 4 occurrences within 28 inclusive days; preserve exact 7-day cadence and one occurrence per date in the matched category/amount group.
- Monthly: at least 3 occurrences within 90 inclusive days; preserve consecutive months on the same day-of-month or all month ends, including leap years, with one occurrence per date.
- Preserve exact category + Decimal amount equality. The meaning/tolerance of “similar amounts” remains PENDING USER DECISION. No +/-15% or any other Anomaly tolerance is used.
- Only user-confirmed, non-null event times enter the existing four-hour buckets. Anomaly uses the same 240-minute partition; a unit contract test verifies equality. Behavior does not import Anomaly scoring, decisions, or baseline membership.

Implementation/display choices:
- SQL scans windows before limiting results. For each category/amount/type, return the earliest qualifying minimal witness (5/4/3 dates), not an exhaustive catalogue of all overlapping windows. General and weekly/monthly may coexist for the same group. Counts describe the displayed witness, not every occurrence in all history.
- Preserve the 50-result limit with a 51st sentinel and hasMore; missing categories in a truncated response are not declared unready.
- All findings include transaction references (id, date, amount, confirmed time or null), occurrence count and observed date span. Category-change evidence covers both compared periods; time evidence covers the matching current bucket; recurrence evidence covers exactly its witness dates and amount. UI opens these read-only snapshot rows in an expandable keyboard-accessible table, 20 rows at a time.
- findings.findingType distinguishes period_change, time_observation and recurrence. Changes alone never produce a recurrence. The Behavior hero uses recurrence only; comparison/time observations and recurrence have separate labeled sections.
- Insufficient category evidence is labeled “หลักฐานยังไม่เพียงพอ”; statements describe observations rather than causes, personality or habits.
- The existing RepeatableRead snapshot, authenticated ownership, private/no-store response and frontend session/query/abort guards are retained. No financial writes, schema changes, migrations or other-module UI changes.

Memory/compatibility caveat:
- Unlike the earlier aggregate-only implementation, aggregate rows now contain minimal transaction evidence references. Memory therefore also scales with the number of scoped transactions; the old claim that memory depends only on day/category/bucket counts no longer applies. Full descriptions/notes and Anomaly history are not read. Evidence render pagination limits DOM size, not server evidence memory.
- Existing fields are retained, recurrence metadata and findingType are additive, and ruleVersion is behavior-v2 with the current rule hash. Consumers must not interpret a period_change as recurrence.
- The old standalone runBehaviorDatabase.cjs assumes 12 migrations and loads dotenv. The new runBehaviorV2.cjs creates a fresh isolated PostgreSQL instance, disables dotenv, verifies current_database before deploying the existing migrations, and runs only Behavior unit/database tests. No application/UAT database is used.
- Historical test/UAT entries above remain historical; they do not constitute user acceptance of v2.

### v2 automated verification (not User Acceptance)
- Final Behavior unit + PostgreSQL/HTTP run: 49 tests passed, zero failures/skips, 49.86 seconds as reported by Node (parent tests included).
- Fresh isolated PostgreSQL database: spendsense_goals_test_behavior_v2_1791918123451, localhost:54371, container spendsense-behavior-v2-test-1791918123451. Verified current_database before migration; all 21 existing migrations applied and status up to date. No schema/migration files changed. Test resources retained.
- An earlier run failed only the snapshot fixture's old three-weekly-occurrence expectation. Updated that fixture to four occurrences and its exact expected totals (190.00, 37 transactions), retaining atomic CRUD interleaving, RepeatableRead, three-query count and full before/during equality assertions. Final run passed both cut points.
- Chrome browser regression: 10 groups passed with synthetic API mocks on separate preview localhost:5298. Covers inspectable transaction evidence, recurrence vs comparison labels, unconfirmed time hidden, loading/error/keyboard retry, old filter/session responses and 390px mobile containment. This is not real-user acceptance.
- Backend and frontend builds passed. No UAT backend restart or application/production database connection.
- Synthetic 732-day volume test, 8 categories and 7 bucket values (including unconfirmed), measured 40,992 and 81,984 transactions. HTTP samples: 2662.54 ms and 1855.21 ms respectively. Serialized responses: 152,242 and 205,640 bytes. Highest sampled process RSS across measured build rounds: 429,871,104 bytes. These are local, GC/cache-dependent observations, not production latency guarantees or maximum-memory bounds.
- Count/span readiness matrix 29/30 x 29/30, general 4/5 distinct dates and 30/31 inclusive days, early/later rolling windows, duplicates, weekly 3/4, monthly 2/3 and leap ends, exact amount, owned evidence and cutoff, confirmed time, 50/51 limit, read-only invariance and snapshot concurrency are covered.
- Under retained cadence, four weekly occurrences span 22 inclusive days; three consecutive-month occurrences span at most 63. A 28/29-day or 90/91-day minimal witness cannot also satisfy exact cadence, so tests separately enforce window constants and reject broken cadence rather than fabricate valid boundary examples.
- v2 User Acceptance remains unrecorded; prior Behavior acceptance is not extended to these changes.


## Evidence overlap and explicit pending rules — 21 October 2026

This section supersedes the earlier unrestricted coexistence of overlapping general/weekly/monthly cards. All seven finding IDs and all approved numeric thresholds remain unchanged. No schema/migration, Anomaly recurrence reuse, collection activation or automatic amount-pattern matching is introduced.

Duplicate evidence policy:
- Compare qualified, earliest witnesses already selected by the existing scanner, within the same category ID and exact Decimal amount only.
- Specificity is monthly > weekly > general. Suppress a lower-specificity witness only when ALL dates of a higher-specificity witness occur in it and the count on each shared date is at least the higher witness count. Each source witness contains all transactions in that category/amount/date group, so this means the higher transaction evidence is wholly contained.
- Sharing a category/amount, overlapping date ranges, or sharing only some evidence dates is insufficient. Independent and partial-overlap witnesses remain, including different types in the same category/amount. No percentage overlap or date/amount tolerance is invented.
- Example: general dates Jan 1/8/15/22/29 and weekly Jan 1/8/15/22 retain the weekly card. General March 1/3/5/7/9 remains independent. Do not merge or inflate the surviving card's four transactions; all spending remains in facts.
- Same-type earliest-witness policy remains unchanged; this is not a new exhaustive discovery of every disjoint episode of the same type. Equal-priority witnesses are not removed by this filter.
- SQL applies the containment predicate after earliest-witness selection and BEFORE LIMIT 51. The pure Behavior helper applies the same predicate before the display cap, supporting synthetic inputs. hasMore counts surviving witnesses; independent cards fill freed slots. Existing deterministic result ordering is retained; specificity is suppression priority, not a new global ranking.
- Under current exact cadence, a monthly three-date witness cannot fit wholly inside a qualifying 30-day general or 28-day weekly witness. The precedence helper nevertheless defines monthly priority explicitly; its direct predicate test is not presented as a valid monthly cadence example. Valid independent monthly witnesses are separately tested end to end.

Shared explanations and pending decisions:
- Match the same category and exactly equal amount today. amount tolerance, date tolerance and minimum increase threshold remain PENDING; no new values are inferred. Exact seven-day cadence and same-day/month-end rules remain.
- A tiny positive increase still qualifies if existing guards pass; it is not a claim of statistical significance. Comparison findings cover increases; decreases remain factual deltas.
- Confirmed-time coverage = confirmed non-null expense times / all scoped expenses * 100%. Time findings describe concentration, not abnormality. No Anomaly scoring or thresholds are imported.
- Recurrence no-match wording now distinguishes failed current readiness (not enough data), completed inspection with no qualifying match, and a truncated result (unknown for omitted categories). There is no new category recurrence-readiness threshold.
- Comparison status is explicit per category: insufficient period/category evidence versus evaluated with no increase finding. Existing detailed insufficient-category messages remain. Time status independently distinguishes insufficient confirmed-time data from inspected/no concentration. These checks use all findings, not just the three-card preview.
- UI explains these rules, including pending decisions, without requiring a new setting or consent action.

Validation additions: synthetic unit cases for containment, partial/disjoint evidence, precedence, exact category/amount, cap/hasMore, tiny increases/decreases and all seven finding IDs; isolated SQL cases for filtering before LIMIT and three independent types in the same group; browser API-mock cases for card counts, independent evidence, pending wording and insufficient versus no-match statuses. Results for this revision are recorded after execution below.


### Verification of 21 October revision
- Backend TypeScript build and frontend app/node TypeScript no-emit checks passed.
- Behavior unit + isolated PostgreSQL/HTTP suite: 54 tests passed, 0 failures/skips (parent tests included), 24.20 seconds. Includes unchanged readiness/cadence/time/category boundaries, snapshot/read-only invariance and 732-day synthetic volume cases, plus new deduplication-before-cap and independent evidence cases.
- Used only new container spendsense-behavior-v2-test-1792577224335, database spendsense_goals_test_behavior_v2_1792577224335 on loopback port 53896. Runner disabled dotenv and collection, verified current_database, and deployed the 21 EXISTING migrations to this new database. No application database access, schema file edit, new migration or Anomaly rule change. Synthetic resources retained.
- Chrome API-mock regression: 13 PASS groups, including the new evidence/card/status/pending wording checks, original session/filter races and 390/320px containment. Harness now intercepts the current /api path and mocks /auth/me; API calls never pass through to the application backend. It uses a new temporary Chrome profile. Initial run hit a harness null dereference during SetupGate's session remount; waiting for the report to exist fixed the harness without weakening the old-session assertion. Final full run passed.
- git diff --check passed for selected changes. Existing local .env.example, seed, mockups and generated OCR files were left untouched. No stage/commit/push. This is automated synthetic verification, not user acceptance.

## behavior-v3: user-confirmed tolerances — 24 October 2026

The user confirmed the three previously pending values in conversation on 24 October 2026. They supersede the "PENDING USER DECISION" and exact-amount/exact-cadence statements above:
- Amount tolerance: every amount in a recurrence group is within 10% of the group median (inclusive). Applies to general, weekly and monthly. Not the Anomaly 15% helper.
- Date tolerance: weekly gaps 7±1 days; monthly occurrences within ±3 days of the due date (anchor day clamped to month end, or month end if the anchor is a month end).
- Minimum increase: a category change finding requires an increase of >=5% of the previous period AND >=100 baht. Smaller increases remain facts only.
- Counts, windows, readiness, guards, the 7 finding IDs and monthly > weekly > general precedence are unchanged.

Implementation (`backend/src/lib/behaviorRules.ts`, `behavior.ts`):
- Recurrence is no longer an exact-amount SQL partition. `findRecurrences` searches in Node over the per-transaction evidence already loaded by the bounded aggregate query, using a date index and integer-satang comparisons; `amountBand` is the Decimal reference. One witness per category, kind and amount band (earliest qualifying chain). Days with two in-band transactions stay ambiguous for weekly/monthly.
- Containment dedup now compares transaction ids. `behaviorInput` applies it before returning, as the SQL did before. Transaction reads per request: 2 (was 3).
- ruleVersion is now `behavior-v3-<hash>`. UI rule text on /behavior updated; no API field removed.

AI verification on 24 October 2026 (synthetic only, not user acceptance):
- Backend `tsc` and build, frontend `tsc -b` and build: PASS (existing bundle-size warning).
- `tests/runBehaviorV2.cjs` on a new disposable container/database (`spendsense_goals_test_behavior_v2_1792823253606`, 21 existing migrations, dotenv disabled): 59/59 PASS, 0 fail/skip. The unit file has 44 tests, including new boundary tests for 10%, ±1/±3 days and 5% AND 100 baht.
- Earlier run in this revision: a first implementation pushed 732-day volume query time to ~130 s, and one dedup test failed. Both were fixed (date index + integer band; dedup in `behaviorInput`) before the final run. Final volume measurements: query 2.1–5.5 s, build 0.6–1.3 s, while an obsolete run was still sharing the CPU for part of the time. Not a production benchmark.
- Chrome API-mock regression `tests/behavior.browser.cjs` against vite preview 5177: 13/13 PASS; text assertions updated from pending wording to the confirmed rules.
- No application database access, schema or migration change. Test containers retained. No stage/commit/push.
- User acceptance of behavior-v3 is still required; earlier acceptance does not carry over.
