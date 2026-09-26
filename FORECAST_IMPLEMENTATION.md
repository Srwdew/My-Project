# Forecast — 26 กันยายน 2026 (Asia/Bangkok)

## Scope
หน้า /forecast แยกจาก Dashboard เชื่อมด้วย Sidebar และลิงก์ Overview ใช้ AppLayout, UserHeader และ NotificationBell เดิม GET /dashboard และรายงานเดิมคง contract เดิม ไม่มี migration/dependency ใหม่ ไม่สร้าง forecast notification ไม่เขียน forecast กลับ Transaction/Budget

ใช้ GET /forecast จาก auth user เท่านั้น ไม่รับ query (รวม userId/cutoff/month/horizon) ตอบ400; ไม่มี auth ตอบ401; private,no-store จับ asOfDate Bangkok ครั้งเดียว อ่าน bounded expense aggregates/category labels/month Budget ใน RepeatableRead แล้วคำนวณจาก snapshot นั้นนอก DB transaction

## Algorithm (approved)
Holt linear trend แยกหมวดเท่านั้น:
l_t = alpha*y_t + (1-alpha)*(l_previous+b_previous)
b_t = betaStar*(l_t-l_previous) + (1-betaStar)*b_previous
forecast_h = l_t+h*b_t, h=1..7

ข้อมูลถึงเมื่อวาน forecast วันนี้ถึงอีก6วัน วันที่เก็บ/เพิ่มแบบ UTC surrogate ใช้ประวัติไม่เกิน180วัน เริ่มที่ expense แรกในหน้าต่างของหมวด เติมวันที่ไม่มีรายการหลังวันเริ่มเป็น0สำหรับโมเดลเท่านั้น ไม่ยืนยันข้อมูลครบ ไม่เติมวันอนาคต ไม่รวมวันนี้ที่ยังไม่ครบวัน
เกณฑ์ v1 ต่อหมวด:42วันปฏิทิน,14วันที่มี expense,มี expense ใน7วันเต็มล่าสุด ไม่อ้างว่าเป็นหลักประกันความแม่นยำ

Initialization: OLS วันที่1..7 (x mean4, denominator28), slope=b0, level fitted at day7=l0; recur ตั้งแต่day8
Grid alpha/betaStar 0.0..1.0 step0.1 รวม121คู่ Validation ภายในชุดฝึก3folds cut n-21,n-14,n-7 แต่ละfold7วัน เลือก absolute error sum ต่ำสุด แล้ว squared error sum แล้ว alphaต่ำ/betaต่ำ Fit ใหม่ด้วย training ทั้งหมด
Prisma Decimal clone precision40 HALF_UP; clamp เฉพาะ output ติดลบเป็น0; ปัด output รายวันเป็น2ตำแหน่งก่อนรวม/เทียบ และใช้ pipeline เดียวกันตอนเลือกพารามิเตอร์และ backtest
Constants และนโยบายรวมใน modelVersion hash ไม่มีผู้ใช้แก้ threshold/parameters ผ่าน API ไม่มี confidence interval ที่ไม่ได้คำนวณ

## Coverage and conservation
หมวดใน scope มี expense ในหน้าต่าง180วันถึงวันนี้ (ครอบคลุมเดือนปัจจุบันด้วย) หมวดใหม่วันนี้ไม่มีtrainingและเป็นunavailable ไม่ลบ expense ตาม anomaly review/pending/confirmed_problem Profile.income และ Goals ไม่ใช่ source
ทุกหมวดพร้อม=available,บางหมวดพร้อม=partial,ไม่มีพร้อม=unavailable
unavailable daily/total=null ไม่ใช่0; category reason codes:
no_expense_history_before_cutoff / insufficient_calendar_history / insufficient_expense_days / no_recent_expense_records
root reasons: no_expense_history / no_eligible_categories
ยอดรวมรายวัน=ผลรวมรายหมวดที่พร้อมหลังปัด; รวม7วัน=ผลรวมรายวัน=ผลรวม7วันรายหมวด
Previous actual7วันแสดงทั้ง all categories และ comparable categories; ส่วนต่างใช้หมวดชุดเดียวกับ forecast เท่านั้น
Partial ห้ามกล่าวว่ายอดรวมจะอยู่ในงบ แม้ยอดหมวดที่พร้อมต่ำกว่าวงเงิน หมวดที่ไม่พร้อมยังมีชื่อ/เหตุผล/จำนวนวันในตาราง ไม่มีการกระจายส่วนต่างเป็นหมวดอื่น

## Budget
R = Budget.amount - actual expense ทุกหมวดเดือนปัจจุบันถึงขณะอ่าน
r = วันเหลือในเดือนรวมวันนี้; k=min(7,r)
reference = max(R,0)*k/r (HALF_UP cents)
additionalToday = sum per eligible category max(forecastToday-actualTodayOfCategory,0)
comparableAdditional = additionalToday + forecasts หลังวันนี้เฉพาะวันที่ยังอยู่ในเดือนปัจจุบัน
difference = comparableAdditional-reference
suggestedDaily = max(R,0)/r ปัดลงเป็นสตางค์
แสดงforecastครบ7วันแม้ข้ามเดือน; referenceเปรียบเทียบเฉพาะkวัน
ไม่มีBudget => comparison=null; R<0=>already_over_budget, R=0=>budget_exhausted; daily adviceไม่ติดลบ
partial=>partial_forecast_above_reference หรือ partial_cannot_conclude ห้ามสรุปอยู่ในงบ
available=>above_reference/at_reference/below_reference; unavailable=>forecast_unavailable (แต่รายงานเกินงบจริงได้)
CategoryBudget ไม่บวกเพิ่มในงบรวม

## Response / UI
Response: status/asOfDate/timezone/cutoffDate/forecastStartDate/forecastEndDate/horizonDays/modelVersion/method/aggregation
coverage {availableCategories,unavailableCategories,completeForObservedCategories}
categories {categoryId,categoryName,status,training,parameters,clampedDays,daily,sevenDayTotal,previousDaily,previousSevenDayActual,recordedExpenseToday,reasonCodes}
summary {scope,daily,sevenDayForecastTotal,previousSevenDayActualAllCategories,previousSevenDayActualComparableCategories,comparablePeriodDifference}
previousPeriod {startDate,endDate,daily}; budgetComparison และ warningCodes
ทุกเงินเป็น decimal string ไม่มี JS float สะสมเงิน Number ใช้เฉพาะ SVG geometry
กราฟ Actualทึบ/Forecastประ มี cutoff และตาราง14วันเปิดด้วยkeyboard; missing dayโปร่งและข้อความไม่มีรายการ ตารางรายหมวด7วัน+รวม; partialมีคำเตือนชัดเจน
กราฟรวมใช้ hasComparableExpenseRecords แยกจาก hasExpenseRecords ทุกหมวด เพื่อไม่เรียกศูนย์ในหมวดที่เลือกว่ามีรายการจากหมวดอื่น
Loading/error/retry, responsive/long names/money, session/day key + abort/active/token guards; refreshในsessionเดิมคง DOM/ข้อมูลเดิมขณะรอเพื่อไม่ทำkeyboard focusหาย ส่วนเปลี่ยนsession/dayremountล้างข้อมูล
Selectจำกัดความกว้างตามcontainerหลังbrowserพบlong-categoryoverflow

## Tests and limitations
Calculation/HTTP/PostgreSQL/backtest/regressionใช้ฐานทดสอบแยก ไม่มีfixturesในapplication ทดสอบactual SQLเป็นuser/type/date bounded category/day GROUP BYหนึ่งquery ไม่อ่านTransactionหรือGoal ledgerทั้งบัญชี
Backtestมีconstant/linear/declining/variable/gaps/new-category fixtures ใช้ข้อมูลสังเคราะห์เท่านั้น ไม่มี accuracy claim; ดู FORECAST_BACKTEST_REPORT.md
Chrome API mocksตรวจpartial/unavailable/dates/table/keyboard/retry/session/navigation/mobile และ regression Dashboard/Anomaly/Review/Settings
ไม่ได้ยืนยัน real-backend Forecast browser acceptance โดยผู้ใช้ ยังต้องตรวจด้วยบัญชีทดสอบแยก:ครบ/partial/ไม่มีข้อมูล/ไม่มีงบ/งบเกิน/ข้ามเดือน/หมวดหลายรายการ/refreshหลังCRUD/สลับsessionและมือถือ
รูปที่12ต้นฉบับยังไม่ได้รับ จึงจัดองค์ประกอบตามข้อกำหนดข้อความที่อนุมัติ ไม่อ้างว่าpixelตรงภาพ
ไม่มีการbenchข้อมูลหมวดจำนวนมาก; fittingเป็น synchronous CPU และgrid searchต่อหมวด แม้query/memoryจำกัด180 daily aggregatesต่อหมวด อาจต้องวัดlatencyและแยกworker/cacheเมื่อมีหลักฐานจำเป็น
ไม่สามารถ reconstructข้อมูลก่อนการแก้/ลบย้อนหลังได้ครบ Backtestจึงอ้างอิงข้อมูลปัจจุบันตามtransactionDate ไม่ใช่ผลที่เคยออกจริง
Final evidence logs อยู่ .git/settings-verification นอกGit ไม่มี stage/commit/push


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
