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
