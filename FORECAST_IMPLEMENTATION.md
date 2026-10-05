# Forecast total-only — 4 October 2026 (Asia/Bangkok)

## Current scope and thesis mapping
GET /forecast and /forecast use one Holt model on daily expense totals, not a sum of category forecasts. Authentication, strict no-query contract (400), 401, private/no-store, Bangkok date capture, RepeatableRead snapshot, and frontend abort/session guards are retained. No schema, migration, dependency, notification or financial write is added.

Reference: C:\Doc Project\รวมเล่ม (3-67).pdf, PDF pages21–22 describe daily expense aggregation/Holt, seven-day total and current-month budget comparison; page55 gives general readiness of30 transactions/30days; pages40–41 cover Holt and held-out MAE/RMSE. Page20 mentions category forecasting: total-only is the user's explicit superseding scope decision, not a claim that the thesis has no category wording. Inclusive observed span and expense-only count follow the approved implementation specification.
Initialization, defaults, tuning threshold, training window and warning thresholds below are engineering policies, not thesis requirements or statistically established guarantees.

## Input and readiness
Only auth user's type=expense transactions, including Anomaly-flagged/reviewed expenses. Category assignment/name/age has no effect; no Category query or category eligibility.
- Lifetime count/min/max dates through yesterday's cutoff are aggregated in PostgreSQL.
- Ready iff count>=30 AND inclusive(lastExpenseDate-firstExpenseDate)+1>=30.
- Today's and future expenses cannot unlock readiness or enter fitting. Today is read separately for budget reconciliation.
- unavailable: summary.daily, sevenDayForecastTotal, periodDifference, parameters and parameterMode are null; reasons insufficient_expense_count / insufficient_observed_span. Actual facts remain available.
- available applies to all recorded expense. No partial status or category coverage.

A second PostgreSQL GROUP BY transactionDate returns at most181 daily rows through today, not transaction histories. Training uses at most180 days ending cutoff, starting at max(first lifetime expense, cutoff-179). Fill missing historical dates with0, never future dates. Zeros indicate missing records, not verified zero spending.
Readiness spans lifetime, unlike the bounded fit: an old ready account can have180 zero-filled training dates and a zero model output. Show last recorded expense, zero-filled count, longest gap and warnings; do not invent expense or silently gate it as unavailable.
Stale warning: last expense >=7 days before cutoff. Long-gap warning: >=7 consecutive dates without records within training. These versioned warning thresholds do not change readiness.

## Model and reproducibility
Model: holt-total-v2-e949a61713de0b90; FORECAST_RULE JSON is SHA256-versioned.
l[t]=alpha*y[t]+(1-alpha)*(l[t-1]+b[t-1])
b[t]=betaStar*(l[t]-l[t-1])+(1-betaStar)*b[t-1]
forecast[h]=l[T]+h*b[T], h=1..7.

OLS on first7 days initializes trend and level at day7; recur from day8. Prisma Decimal clone precision40, HALF_UP. Clip negative output to0, round each total/day to cents, then sum the displayed seven daily values. No category rounding or category models.

Ready training30–41days: parameterMode=fixed_default, alpha0.2, betaStar0.1; validationMAE/RMSE=null. These conservative smoothing starting values (trend updates slower than level) were chosen as engineering defaults before this total-model outer benchmark, not fitted to its results or claimed optimal. Thirty calendar days allow initialization and recursion but do not establish reliable personal accuracy.

Training>=42days: parameterMode=inner_validation;121 pairs alpha/betaStar0.0..1.0 step0.1. Three inner7-day folds at n-21,n-14,n-7; earliest fold has21training days at n=42. Minimize rounded/clipped absolute error, then squared error, then lower alpha/beta via stable grid order. Refit chosen parameters through cutoff. Forty-two retains the existing three-fold scheme with a minimum21-day inner fit; it is a reproducible heuristic, not evidence that tuning is statistically reliable. All-zero or sparse long histories can still tune; warnings remain.
Inner errors are selection diagnostics, not held-out accuracy or UI scores.

## Dates, actual comparison and budget
Cutoff=yesterday Bangkok; forecast today..today+6 inclusive, always7 dates, including month/year/leap boundaries. Compare recorded total expense cutoff-6..cutoff (seven equal-length previous days). No category selection for either period.

R=monthly Budget.amount - actual expense this month through now.
r=remaining calendar days including today; k=min(7,r).
reference=HALF_UP(max(R,0)*k/r,2).
additionalToday=max(totalForecastToday-totalActualToday,0).
predictedAdditionalExpense=additionalToday+sum(forecast on remaining in-month days).
difference=predictedAdditionalExpense-reference.
suggestedAdditionalDailyAmount=floorToCents(max(R,0)/r).
No Budget => budgetComparison=null. R<0 => already_over_budget; R=0 => budget_exhausted. Otherwise forecast_unavailable/above_reference/at_reference/below_reference. Never guarantee staying within the entire month's budget. CategoryBudget is not added to monthly budget. Forecast days next month remain visible but excluded from current month's comparison.

## Breaking API/UI contract
Retain dates, method=holt_linear, modelVersion and budgetComparison. aggregation=daily_expense_total_before_holt.
New explicit readiness {ready,transactionCount,firstExpenseDate,lastExpenseDate,observedSpanDays,reasonCodes}, training, parameterMode, parameters, recordedExpenseToday and daysSinceLastExpense.
summary {daily,sevenDayForecastTotal,previousSevenDayActual,periodDifference}.
previousPeriod.daily {date,amount,hasExpenseRecords}.
Remove categories, coverage, category forecasts/parameters, comparable category fields and partial reason/status codes from the actual response (no deprecated aliases). Deploy frontend/backend together.
UI contains totals, actual comparison, graph/accessibility table, readiness/gap warnings, budget advice and model explanation only; no category select/table. Decimal strings are used for money; Number only for SVG geometry. Refresh retains same-session content while loading; session/day changes clear old state.

## Evaluation, tests and acceptance
New total benchmark: FORECAST_TOTAL_BACKTEST_REPORT.md. Old category-v1 scores in FORECAST_BACKTEST_REPORT.md are historical, never relabelled as total-v2 evidence.
Deterministic synthetic data only; independent outer horizons1–7, cutoff-only inner selection. Baselines Seasonal naive and Mean-7 use identical account-origin readiness, history and daily rounding. Report pooled, horizon, scenario, parameter-mode and7-day errors plus coverage separately. No outer-score-based policy changes. Overlapping training/windows/points are dependent, not independent samples; no real-user accuracy claim.

AI execution on4October2026:
- Backend/frontend builds passed. Frontend main645.14kB (gzip175.16kB), existing >500kB warning. Builds are of this preserved dirty workspace, not an isolated staged candidate.
- Initial calculation/backtest/benchmark unit run16/16; HTTP/PostgreSQL + Behavior unit regression38/38 on a newly created isolated PostgreSQL16 database. Additional snapshot/budget assertions are recorded in the final verification below.
- Chrome real browser with API mocks passed total-only display, unavailable, keyboard/table/retry, session race, navigation cancellation and390px overflow checks. This is NOT real-backend user acceptance.
- Synthetic total benchmark432origins,412ready/20unavailable,2884daily points per model, elapsed98632ms. Mean-7 has lower pooled daily MAE/RMSE and7-day MAE/RMSE than Holt in this benchmark.
- Existing migrations deployed only to the new isolated test database to initialize its schema. No application database connection or schema/migration source change.
- Total-v2 User Acceptance: PASS, confirmed by the user in this conversation for all three acceptance accounts; see the separate user-confirmation record below. Historical category-v1 acceptance remains separate.

Manual acceptance on a separate acceptance database: verify29/30count x29/30span, today's exclusion, multiple/new categories, actual today below/above forecast, stale/gaps, absent/exhausted/overbudget, cross-month7dates, CRUD refresh, account switch, keyboard/mobile. Compare totals to expense SQL; never seed application.


## User Acceptance — total-v2: PASS (ยืนยันในบทสนทนา)

ผู้ใช้ยืนยันในบทสนทนาว่า User Acceptance ผ่านครบทั้งสามบัญชี: `forecast_not_ready`, `forecast_ready` และ `forecast_stale` บันทึกนี้เป็นคำยืนยันของผู้ใช้ แยกจากผลตรวจอัตโนมัติ/AI ด้านล่าง ผู้ใช้ไม่ได้ระบุวันเวลาเริ่มหรือสิ้นสุดการตรวจรับและค่าตัวเลขที่เห็น จึงไม่ระบุวันเวลาหรืออ้างค่าตัวเลขเป็นผลที่ผู้ใช้ตรวจเห็น

ขั้นตอนตรวจโดยสรุปของชุด acceptance: เข้าสู่ระบบด้วยแต่ละบัญชีบนระบบทดสอบแยก → เปิด /forecast → ตรวจสถานะ ข้อความเหตุผล/คำเตือน และการแสดงยอดรวม → เปิดตารางกราฟและ refresh → logout ก่อนสลับบัญชี รายละเอียดนี้เป็นขั้นตอนของชุดตรวจ ไม่ใช่บันทึกเวลาหรือการคลิกแต่ละขั้นของผู้ใช้

| บัญชีทดสอบ | ผลคาดหวังตามกรณี | ผลที่ผู้ใช้ยืนยัน |
| --- | --- | --- |
| forecast_not_ready | รายจ่ายไม่ครบเกณฑ์: unavailable พร้อมเหตุผล; forecast รายวันและยอดรวมเป็น null ไม่ใช่ศูนย์ | ผ่านกรณีนี้ |
| forecast_ready | available; แสดงยอดรวมรายวันและรวม 7 วัน กราฟ/ตารางและการเทียบงบ ไม่มี forecast รายหมวดหรือ partial | ผ่านกรณีนี้ |
| forecast_stale | ประวัติผ่าน readiness จึงยัง available พร้อมวันรายการล่าสุดและคำเตือนข้อมูลเก่า/ช่องว่างตาม implementation; ไม่อ้างว่าข้อมูลครบหรือจะไม่มีรายจ่ายจริง | ผ่านกรณีนี้ |

### ผลตรวจ AI แยกต่างหาก — 4 ตุลาคม 2026 (Asia/Bangkok)

AI ทดสอบ Login ผ่านเว็บจริงและ GET /forecast กับ backend/PostgreSQL ทดสอบแยก ผลตรงกับค่าคาดหวังที่คำนวณก่อนสร้างข้อมูล: forecast_not_ready ได้ unavailable/null; forecast_ready ได้ยอดรวม 7 วัน 696.56 บาท; forecast_stale ได้ยอดรวม 0.00 บาทพร้อมคำเตือนข้อมูลเก่า ช่องว่าง 9 วัน และการปรับค่าพยากรณ์ติดลบเป็นศูนย์ ค่าดังกล่าวเป็นผลตรวจของ AI ณ cutoff 3 ตุลาคม 2026 สำหรับ forecast 4–10 ตุลาคม 2026 ไม่ใช่ค่าที่ผู้ใช้ระบุว่าตรวจเห็น และไม่ใช่การรันทดสอบใหม่ในรอบปิดเอกสาร

Benchmark ใช้ข้อมูลสังเคราะห์เท่านั้น ผล User Acceptance ยืนยันการใช้งาน ไม่ใช่หลักฐานความแม่นยำกับผู้ใช้จริง; windows และ forecast points ไม่ใช่ตัวอย่างอิสระ ดู FORECAST_TOTAL_BACKTEST_REPORT.md แยกจากรายงาน category-v1 เดิม ไม่มีรหัสผ่านหรือ token ในบันทึกนี้

## Historical verification and user acceptance (category-v1 only)
The following retained record belongs to the superseded category model and is not acceptance of total-v2.

## Final verification — 26 กันยายน 2026
- 136 automated tests passed, 0 failed/skipped (calculation, HTTP, isolated PostgreSQL, backtest and existing regression).
- Prisma validate/generate and backend/frontend builds passed. Candidate builds excluded preexisting local App.css/package changes. Existing >500kB bundle warning remains.
- Chrome API mocks: Forecast6 groups; Dashboard17 (including10 controlled month-race rounds); Anomaly7; Review6; Settings12.
- Product fixes from browser evidence: retain same-session DOM during refresh to preserve keyboard focus; constrain long category select width. Harness fixes: mock /categories returns its real array contract, SVG assertions select Forecast graph rather than shared notification bell.
- Existing AnomalyReview DB test observer was inside the lock-holder transaction and could cache pg_stat_activity. It now uses a separate autocommit observer with pg_blocking_pids targeting the exact locker, and checks401 after revocation. No production Anomaly change or random delay added. Failed run retained outsideGit; final full suite passes.
- Real-user Forecast browser acceptance remains pending. No application fixtures/migration changes, no stage/commit/push.


## User browser acceptance — 26 กันยายน 2026
ผู้ใช้ยืนยันตรวจ Forecast ครบและผ่านบน frontend/backend และ PostgreSQL acceptance จริง แยกจาก automated tests/Chrome API mocks และ synthetic backtest ที่รายงานก่อนหน้า ผลนี้แทนสถานะก่อนหน้าที่ยังรอผู้ใช้ตรวจรับ
ตรวจ available/partial/unavailable,รายวันรายหมวดและยอดรวม,เทียบ actual หมวดชุดเดียวกัน,ข้ามเดือน,งบครบ/เกิน,refreshหลังCRUD,keyboard/mobile และคำเตือนวันเติม0 ไม่ใช้ผลนี้กล่าวอ้างความแม่นยำเชิงสถิติ
ข้อมูลบัญชีและbaseline acceptance, database dumps, logs และ artifacts ไม่รวม commit
การแก้ AnomalyReview concurrency observer เป็นการแก้ test harness อิสระ ไม่ใช่ dependency ของ Forecast จึงรักษาไว้ใน working tree แต่นอก commit Forecast ผล136 testsก่อนหน้านี้เป็นผลworkspaceที่มีการแก้ observer; staged candidate ตรวจจาก AnomalyReview test เวอร์ชันในGitเดิมแยกต่างหากแล้ว และผ่าน


## Staged candidate verification — 26 กันยายน 2026
ส่งออกไฟล์361ไฟล์จาก Git index เป็น candidate แยกและติดตั้งด้วย npm ci จาก lockfiles; ไม่คัดลอก source/config หรือ dependencies จาก dirty workspace
Prisma validate/generate, backend/frontend build ผ่าน; automated calculation/HTTP/isolated PostgreSQL/backtest/regression 136/136 ผ่าน ไม่มี fail/skip โดยใช้ AnomalyReview test เวอร์ชัน Git เดิม ไม่รวม local concurrency observer fix
ฐานทดสอบใหม่ apply migrations เดิม12ตัวครบ ไม่มี migration/schema/dependency ใหม่ และไม่เปลี่ยนฐาน application
Chrome API-mock suites Forecast, Dashboard (10 controlled month-race rounds), Anomaly, Review และ Settings ผ่านจาก candidate เดียวกัน; ผลนี้แยกจาก user browser acceptance/backendจริงด้านบน
ตรวจเฉพาะ17 staged paths: ไม่มี .env/seed/acceptance fixtures/dump/log/screenshot/generated artifact; ไม่พบ secret patterns ที่ตรวจ และ git diff --cached --check ผ่าน มีเพียง frontend bundle warning >500kB


## Total-v2 final AI verification — 4 October 2026
Final focused run:26/26 tests passed (calculation, backtest, benchmark assertions, real HTTP/PostgreSQL),0failed/skipped,14058ms. Includes deterministic CRUD commits between readiness/daily and daily/budget queries: HTTP response stays in one RepeatableRead snapshot; subsequent GET observes the committed changes. Budget cases verify total actual today below/equal/above forecast and above/at/below reference. Browser tests and builds listed above remain valid: subsequent edits were tests/docs only.
