# Current behavior, confirmed requirements and pending decisions

ร่างทะเบียน ณ 21 ตุลาคม 2026 ปรับ 24 ตุลาคม 2026 ตามคำยืนยันของผู้ใช้ อ้าง working tree ไม่ใช่เฉพาะ HEAD ตารางนี้เป็นสรุปประเด็นที่ตรวจ ไม่ใช่ทะเบียนข้อกำหนดครบทุกโมดูล

## พฤติกรรมปัจจุบันที่เห็นใน source

| เรื่อง | สิ่งที่ source ทำ | หลักฐาน |
|---|---|---|
| API routing | dev /api ผ่าน Vite proxy ไป 4000; non-dev ใช้ VITE_API_URL หรือ /api | [api.ts](../frontend/src/api.ts), [vite.config.ts](../frontend/vite.config.ts) |
| Forecast | Holt ยอดรวมรายวัน, readiness lifetime ถึงเมื่อวาน 30 รายจ่าย/ระยะ30วัน, fitting ไม่เกิน180วัน, forecast7วัน | [expenseForecast.ts](../backend/src/lib/expenseForecast.ts), [holt.ts](../backend/src/lib/holt.ts) |
| Behavior | ใช้รายจ่ายในขอบเขตที่เลือก; comparison ต้องทั้งสองช่วงพร้อม; recurrence/time ใช้ readiness ปัจจุบัน | [behavior.ts](../backend/src/lib/behavior.ts) |
| ลดการ์ด Behavior ซ้ำ | หมวดเดียวกันและรายการหลักฐาน (transaction id) ของประเภทที่สูงกว่าอยู่ครบในอีกการ์ด; ไม่ลบเพราะทับกันบางส่วน; ทำก่อนจำกัด 50 การ์ด |
| ค้นหา recurrence | `behavior-v3` ค้นใน Node จากหลักฐานรายธุรกรรมที่โหลดในช่วงที่เลือกแล้ว ไม่ใช้ SQL partition ตามยอดตรงกันอีก (SQL อ่าน Transaction 2 ครั้ง) | [behaviorRules.ts](../backend/src/lib/behaviorRules.ts), [เอกสารนิยาม](../BEHAVIOR_IMPLEMENTATION.md) |
| เวลา | Behavior ใช้เฉพาะเวลายืนยันและไม่ว่าง ไม่ใช้ createdAt; Add Transaction ส่ง confirmation=false | [behavior.ts](../backend/src/lib/behavior.ts), [Addtransaction.tsx](../frontend/src/pages/Addtransaction.tsx) |
| Anomaly experiment | EXPERIMENT_COLLECTION_ENABLED=false และ AUTOMATIC_AMOUNT_MATCHING=false | [experimentRetention.ts](../backend/src/lib/experimentRetention.ts) |
| Password recovery | default disabled; config ไม่ครบเมื่อเปิดอาจทำให้ startup ล้มเหลว | [passwordReset.ts route](../backend/src/routes/passwordReset.ts) |

ค่าในโค้ดเพียงอย่างเดียวไม่เท่ากับหลักฐานว่าผู้ใช้อนุมัติ และไม่ยืนยันว่าระบบที่ deploy มี environment/ข้อมูลตามนี้

## ข้อกำหนดที่ยืนยันแล้ว

สำหรับ Behavior ผู้ใช้ยืนยันในงานก่อนหน้าของบทสนทนานี้:

| ประเด็น | ข้อกำหนดที่คงไว้ |
|---|---|
| Readiness | >=30 รายจ่าย และระยะจากวันแรกถึงสุดท้าย >=30 วัน inclusive; ไม่ใช่30วันที่มีรายการ |
| ทั่วไป | 5 วันที่แตกต่างกันภายใน30วัน |
| รายสัปดาห์ | 4 ครั้งภายใน28วัน ห่างกัน 7±1 วัน (ยืนยัน 24 ต.ค. 2026) |
| รายเดือน | 3 ครั้งภายใน90วัน แต่ละครั้งห่างจากวันครบรอบไม่เกิน ±3 วัน; วันครบรอบ = วันเดียวกับครั้งแรก (ปรับเป็นสิ้นเดือนถ้าเดือนสั้นกว่า) หรือสิ้นเดือนถ้าครั้งแรกเป็นสิ้นเดือน (ยืนยัน 24 ต.ค. 2026) |
| Amount tolerance | ทุกยอดในกลุ่มต่างจาก median ของกลุ่มไม่เกิน 10% (รวมค่าเท่ากับ 10%) ใช้กับทั้ง 3 แบบ (ยืนยัน 24 ต.ค. 2026) |
| ขั้นต่ำของยอดเพิ่ม | ข้อค้นพบรายหมวดต้องเพิ่ม >=5% ของช่วงก่อน **และ** >=100 บาท ทั้งสองเงื่อนไข; ต่ำกว่านั้นเป็นข้อเท็จจริงเท่านั้น (ยืนยัน 24 ต.ค. 2026) |
| Comparison รายหมวด | readiness ทั้งสองช่วง; >=5รายการบน>=3วันต่อหมวดในแต่ละช่วง; ข้อค้นพบครอบคลุมยอดเพิ่ม |
| เวลา | readiness ช่วงปัจจุบัน; เวลายืนยัน>=30รายการ; coverage>=80%; bucket4ชั่วโมงมี>=50%ของรายการยืนยัน กระจาย>=5วัน |
| ข้อค้นพบ8กรณี | recurrence3แบบ, ยอดเพิ่มจากจำนวน/เฉลี่ย/ทั้งคู่3แบบ, เวลากระจุก1แบบ, หมวดสัดส่วนสูง1แบบ (เพิ่ม 26 ต.ค. 2026) |
| หมวดสัดส่วนสูง | readiness ช่วงปัจจุบัน; หมวดมี>=5รายการบน>=3วันในช่วงที่เลือก; ยอดหมวด>=40%ของรายจ่ายรวม (รวมค่าเท่ากับ 40%); ไม่ใช้เมื่อกรองหมวดเดียว (ยืนยัน 26 ต.ค. 2026) |
| ลดการ์ดซ้ำ | รายเดือน > รายสัปดาห์ > ทั่วไป เฉพาะหลักฐานซ้ำซ้อน; ต้องเก็บรูปแบบอิสระแม้หมวด/ยอดตรงกัน |
| ข้อความ | แยกข้อมูลไม่พอกับตรวจแล้วไม่พบ คงเหตุผลระดับหมวด; ไม่อ้างนัยสำคัญ/สาเหตุจากยอดเพิ่มเล็กน้อย; ยอดลดเป็นข้อเท็จจริง |
| การแยกโมดูล | ไม่ใช้ Anomaly recurrence thresholds ทับ Behavior และไม่เปิด collection/automatic matching |

ค่าด้านบนลงโค้ดเป็น `behavior-v3` ใน [behaviorRules.ts](../backend/src/lib/behaviorRules.ts) (`amountTolerance`, `weeklyDateTolerance`, `monthlyDateTolerance`, `minimumIncreaseShare`, `minimumIncreaseAmount`, `dominantShare`) ค่า 10% เป็นค่าของ Behavior เอง ไม่ได้นำ helper 15% ของ Anomaly มาใช้

ข้อกำหนดอื่นที่ผู้ใช้ยืนยัน 24 ต.ค. 2026:
- แผนงานหลักใช้ 8 ขั้นแทนแผน 11 ข้อเดิม: Database Schema → Authentication & Financial Profile → Transaction Core (Manual Entry) → OCR Upload Flow → Data Readiness Check → Core Financial Metrics → Analytics Pipeline → Recommendation Engine & Dashboard
- ตัวเลข Anomaly ใน `ANOMALY_RULE` ([anomalyRules.ts](../backend/src/lib/anomalyRules.ts)) และค่าผ่อนผัน `CADENCES` ([anomalyPatternPolicy.ts](../backend/src/lib/anomalyPatternPolicy.ts)) ล็อกตามค่าปัจจุบัน และใช้แทนกฎเดิม
- Recommendation Engine ครอบคลุม Behavior, Forecast และ Goals (ไม่รวม Anomaly และ Budget); รายละเอียดกฎคำแนะนำยังไม่ได้กำหนด

นิยาม evidence containment เป็นวิธี implementation ที่ได้ทำและทดสอบแล้วในงานก่อนหน้า ไม่ใช่ค่าความคลาดเคลื่อนที่ผู้ใช้กำหนดใหม่ ตั้งแต่ `behavior-v3` เทียบ containment ด้วย transaction id ของหลักฐาน แทนการเทียบยอดตรงกัน ดู [เอกสาร Behavior](../BEHAVIOR_IMPLEMENTATION.md) สำหรับรายละเอียด counts/วัน/earliest witness และข้อจำกัดการไม่แจกแจงทุก episode

ข้อกำหนดการทำงานใน repository จากผู้ใช้: รักษา local changes; ไม่แตะฐานหลักในการทดสอบที่กำหนดให้ใช้ฐานแยก; ไม่ reset ฐานโดยไม่ได้รับอนุญาต; งานเอกสารรอบนี้ห้ามแก้ source/schema/migration และ commit/push

### Financial Profile, Tier 0 และ Alert Layer (ยืนยัน 30 ต.ค. 2026)

รายละเอียดสูตรและ DDL อยู่ใน [FINANCIAL_PROFILE_DESIGN](FINANCIAL_PROFILE_DESIGN.md) ส่วนนี้บันทึกเฉพาะสิ่งที่ผู้ใช้ยืนยัน ยังไม่ได้ implement นอกจาก C5 ที่ระบุไว้

- หลักทั่วไป: ถ้าโจทย์ขัดกับเอกสารโปรเจกต์ ให้ยึดเอกสารโปรเจกต์แล้วแจ้งผู้ใช้
- C1: Forecast Gate คงที่ 30 รายจ่าย / 30 วัน ตาม `FORECAST_RULE` (ค่า 50/90 ในโจทย์เป็นความผิดพลาด)
- C2: Recommendation Engine คงขอบเขตเดิม การจัดลำดับสถานะเป็นชั้นแยกชื่อ **Alert Layer** ซึ่งอ่าน Budget, Forecast, Goal และ Anomaly ได้ แต่ไม่สร้างคำแนะนำ
- C3: Holt ใช้รายจ่ายทั้งหมดเหมือนเดิม (`MODEL_VERSION` ไม่เปลี่ยน) เพราะ anomaly detector ตีความการเปลี่ยนระดับถาวรว่าผิดปกติ ส่วน Holt มีหน้าที่ตามการเปลี่ยนระดับ จึงต้องแยก input ของสองโมดูลจากกัน หลักฐาน synthetic: level-change MAE 8.55 → 126.98 ([รายงาน](FORECAST_ANOMALY_EXCLUSION_BACKTEST.md)) การคัดเฉพาะรายการที่ผู้ใช้ยืนยันเป็น future work
- ISSUE-TEST-2 (เปิดอยู่, บันทึก 2 พ.ย. 2026): `backend/tests/runIsolatedDatabase.cjs` **ไม่ใช่ตัวรันเทสต์ฐานข้อมูลทั้งหมด** ครอบคลุม 10 ชุด (anomaly, anomalyDimensions, anomalyReview, anomalyTolerance, anomalyLevelShift, behavior, forecast, goals, recommendations, flexibleCategories) ผลจากตัวรันนี้ต้องรายงานว่า "N/N จาก 10 ชุดที่ตัวรันครอบคลุม" ไม่ใช่ "ผ่านหมด" ชุดที่ไม่ถูกรัน 15 ชุด: admin, closedAccountExperiment, cycleDefaults, dashboard, defaultCategories (ต้องชื่อฐาน `spendsense_goals_test_categories_`), goalSavingsPlan, overviewGoals (`..._overview_`), passwordReset, reconciliation, settings, setup, setupInvitation, transactionCreateRequest (`..._ocr_`), transactionsByDate, transactionsLimit หลายชุดมีตัวรันของตัวเอง (`tests/run*.cjs`) **อาการที่พบ (ยังไม่หาสาเหตุ):** ลองรันทุกไฟล์ด้วยตัวรันนี้ครั้งเดียว ได้ 135/143 ล้ม 8: admin, defaultCategories, goalSavingsPlan, overviewGoals, passwordReset, transactionCreateRequest ล้มทั้งไฟล์ (คาดว่าเพราะ guard ชื่อฐานหรือ env ของตัวรันเฉพาะ ยังไม่ยืนยัน) และ reconciliation ล้มที่ "PostgreSQL HTTP reconciliation against independent integer-satang totals" หลังรัน 123 วินาที
- ISSUE-ANOM-1 (ปิด 2 พ.ย. 2026, สรุปและข้อจำกัดใน [ANOMALY_LEVEL_SHIFT_BACKTEST](ANOMALY_LEVEL_SHIFT_BACKTEST.md); การจับรายการประจำที่หายไปย้ายเป็นงานต่อยอด): amount screen flag รายการต่อเนื่องทุกรายการเมื่อรายจ่ายขึ้นระดับถาวร (390 รายการใน backtest) ผู้ใช้ปลดล็อก `ANOMALY_RULE` ให้แก้แล้ว (2 พ.ย. 2026)
  - สาเหตุ: `anomaly_dimension_exclusion` ตัดรายการ flagged-unreviewed ออกจาก baseline baseline จึงไม่เคยเห็นระดับใหม่ (390 = ทุกรายการหลังการขยับใน fixture level-change, 130 วัน × 3 seeds) หน้าต่าง 180 วัน, median/MAD และเกณฑ์ modified z 3.5 คงเดิม
  - ขั้นที่ 1: ตัวตรวจการขยับระดับ (5 จาก 7 รายการล่าสุดในหมวดถูก flag ทิศเดียวกัน ขาลงใช้เกณฑ์สมมาตร) ตาราง `AnomalyLevelShift` append-only ระหว่างรอผู้ใช้ยืนยันยังคง flag แต่ยุบเป็นรายการเดียวในคิว เมื่อยืนยันแล้ว ระบบบันทึก decision `normal` แยกทีละรายการ (อ้างการยืนยัน ผูก revision) วัด 390 → X
  - ⚠️ ขั้นที่ 1 เพิ่มค่าใน `ANOMALY_RULE` ทำให้ `RULE_VERSION` เปลี่ยน `reconcileAnomalies` จะประเมินรายจ่ายย้อนหลังทุกรายการของผู้ใช้ที่เปิดแจ้งเตือนใหม่ **ห้ามรันโค้ดนี้กับฐานหลักก่อนงานเสร็จและผู้ใช้อนุมัติ** วิธีวัดอยู่ใน [ANOMALY_LEVEL_SHIFT_BACKTEST](ANOMALY_LEVEL_SHIFT_BACKTEST.md)
  - ขั้นที่ 2 (ใช้แล้ว 2 พ.ย. 2026, `RULE_VERSION` เปลี่ยนอีกครั้ง; ผล: X → Y ไม่เปลี่ยน, ตรวจพบผิด 0 → 0, ช่วงเงียบหลังยืนยัน 30 → 15 วัน ดู [ANOMALY_LEVEL_SHIFT_BACKTEST](ANOMALY_LEVEL_SHIFT_BACKTEST.md)): ขั้นต่ำมิติยอดต่อหมวด 30/10/28 → **10 รายการ / 5 วันที่ต่างกัน / ช่วงห่าง ≥ 14 วัน** วัด X → Y หลักฐาน (`scripts/forecast-experiment/category-minimum.ts`, MoneyData M1 หน้าต่าง 180 วัน 1,217 คู่หมวด-เดือน): รายการที่ได้ใช้ baseline ของหมวดตัวเอง 65% → 90% (หมวด 23% → 53%) ลดเป็น 8 ได้เพิ่มแค่ 3% (93%) ขณะที่ median/MAD จาก n น้อยแกว่งขึ้น **ข้อจำกัด:** หลักฐานมาจาก MoneyData บัญชีเดียว Berka ใช้ไม่ได้เพราะมีแค่ประเภทธุรกรรม ไม่มีหมวดการใช้จ่ายจริง
- ISSUE-ANOM-2 (เปิดอยู่, บันทึก 2 พ.ย. 2026, ยังไม่แก้): หมวดที่ระดับต่างจากทั้งบัญชีมากและข้อมูลไม่ถึงขั้นต่ำ ถูก flag ทุกรายการและล็อกตัวเอง มีอยู่ก่อน ISSUE-ANOM-1 ตัวตรวจการขยับไม่ได้สร้าง แต่ทำให้ปรากฏเป็นคำถาม "ขยับเป็นระดับใหม่หรือไม่" ที่ข้อความผิด
  - กลไก: (1) หมวดที่ยังไม่ถึงขั้นต่ำใช้ baseline ทั้งบัญชี ถ้าระดับหมวดต่างจากบัญชีมาก (fixture: edge ราว 300, sparse ราว 500 เทียบ primary 100–250) รายการแรกๆ ถูก flag ทุกตัว (2) `anomaly_dimension_exclusion` ตัดรายการ flagged-unreviewed ออกจาก baseline ของหมวด หมวดจึงสะสมไม่ถึงขั้นต่ำ (3) flag ทุกรายการไปตลอด เป็นการล็อกตัวเองแบบเดียวกับ ISSUE-ANOM-1 แต่ในหมวดข้อมูลน้อย (4) ตัวตรวจเห็น 5 ใน 7 ถูก flag จึงถามว่า "ขยับตั้งแต่วันที่…" ทั้งที่ความจริงคือ "สูงกว่าค่าเฉลี่ยทั้งบัญชีมาตลอด"
  - ตัวเลข (fixture หลายหมวด 3 seeds ระบบเดิม): flag edge 48, sparse 25 ไม่มีหมวดใดขยับจริง edge ไม่เคยได้ใช้ baseline ของตัวเองเลย (0 ครั้ง) แม้ที่ 10/5/14 ตรวจพบผิด edge 3, sparse 3 (โหมดไม่ตอบ) เท่ากันทั้ง 30/10/28 และ 10/5/14
  - แนวทางที่เป็นไปได้: (ก) ไม่ให้ตัวตรวจทำงานกับรายการที่ประเมินด้วย baseline ทั้งบัญชี (ใช้ `snapshot.scope.amount` ที่บันทึกอยู่แล้ว แก้เฉพาะ TypeScript แต่หมวดเหล่านี้กลับไป flag ทีละรายการ) (ข) ให้ flagged-unreviewed นับเข้าเกณฑ์ขั้นต่ำของหมวด หรือแยก baseline ระดับบัญชีออกจากการคัดออก **ต้องแก้ SQL `anomaly_dimension_exclusion` ซึ่งกระทบทุกมิติ** (ค) เปลี่ยนข้อความการ์ดเมื่อมาจาก baseline ทั้งบัญชี (ข้อความต้องให้ผู้ใช้อนุมัติ) ไม่แก้ตอนนี้เพราะเหลือเวลาสี่สัปดาห์และมีงานที่กระทบรายงานมากกว่า
- ISSUE-TEST-1 (เปิดอยู่, บันทึก 2 พ.ย. 2026): บล็อก Goals ท้าย `backend/tests/overviewInsights.browser.cjs` หมดเวลาที่ `[data-testid=goal-feasibility]` เพราะหน้าภาพรวมไม่แสดง GoalFeasibility แล้ว พังมาก่อนงาน Recommendation Engine ไม่ใช่ regression ใหม่ บล็อกคำแนะนำ 4 บล็อกก่อนหน้าผ่าน ยังไม่แก้จนกว่าจะตัดสินว่าจะลบบล็อกหรือย้ายไปหน้าเป้าหมาย
- ข้อจำกัด: backtest ข้างบนใช้ข้อมูลสังเคราะห์ ส่วน dataset อ้างอิง (Bank Transactions Dataset / Mendeley และ Berka / PKDD'99) อยู่ใน [FORECAST_REAL_DATA_BACKTEST](FORECAST_REAL_DATA_BACKTEST.md) ซึ่งแนะนำ Theta แทน Holt (ยังไม่เปลี่ยนโค้ด)
- C4: ความตั้งใจใช้ค่าเดิม `FINANCIAL_INTENTIONS` ไม่ migrate และใช้ปรับถ้อยคำการ์ดเท่านั้น ไม่กระทบลำดับ
- C5: นิยามรอบอยู่ที่เดียวคือ [cycle.ts](../backend/src/lib/cycle.ts) เฟส 1 คืนเดือนปฏิทิน เฟส 2 สลับเป็นรอบตามวันเงินเข้า ห้ามทำทีละโมดูล ต้องส่ง userId และให้ frontend เลิกคำนวณเดือนเองก่อนจึงสลับได้ ผู้ใช้ที่เงินเข้าไม่แน่นอนใช้เดือนปฏิทิน (ข้อจำกัดที่รู้อยู่แล้ว)
  - CycleContext (ยืนยัน 31 ต.ค. 2026): ทุกฟังก์ชันรอบรับ context ที่สร้างได้จาก `loadCycleContext` / `cycleContextFromProfile` เท่านั้น context ผิดรูปหรือไม่มีต้อง throw ตอน runtime (ห้ามตัดออก แม้ type จะจับได้แล้ว) เหตุผลของเดือนปฏิทินต้องระบุเสมอ: `no_payday` / `payday_set_not_enabled` (มีวันเงินเข้าแต่ยังไม่เปิดเฟส 2) / `irregular` การตรวจรายการซ้ำของสลิปห้ามแตะ cycle.ts (มี test กันไว้)
  - เฟส 2 เปลี่ยนตัวโหลดจุดเดียว แต่ก่อนเปิดใช้ต้องมีครบ: สูตรรอบเงินเข้า, D-4, D-20, WeeklyExpenses, ป้ายชื่อรอบ และ test ReceiptBatch ส่วนที่ 2
- C6 / D-15: โปรไฟล์เก็บแค่รายได้ วันเงินเข้า และความตั้งใจ ส่วนงบอ้างตาราง `Budget` และเป้าอ้างตาราง `Goal` ไม่มีค่าซ้ำที่ต้องซิงก์
- Runway ใช้ "งบคงเหลือ" (เช่น "งบเหลือ 800 ใช้ได้วันละ 160") ไม่เดายอดบัญชี การใช้ยอดบัญชีที่ผู้ใช้กรอกเองเป็น future work
- ลำดับ Alert Layer: เรียงตามความเร่งด่วนเป็นชั้น ชั้น 4 เรียงตามจำนวนเงิน ไม่มีสูตรถ่วงน้ำหนัก (ชั้น 1–3 ออกการ์ดได้ชั้นละใบเดียว)
  - ชั้น 1 งบไม่พอถึงวันเงินเข้า ทำงานเฉพาะเมื่อเหลือ ≤ 7 วัน
  - ชั้น 2 เกิน pace ใน 7 วัน
  - ชั้น 3 เป้าออมหลุด (D-13: ยอดที่ต้องออมรวมทุกเป้า > รายได้ − งบ)
  - ชั้น 4 รายการผิดปกติที่ยังไม่ได้ตัดสิน
- D-1 แก้โปรไฟล์มีผลตั้งแต่วันที่แก้ (เวลาไทย) · D-2 แถวที่ย้ายจากข้อมูลเดิมใช้ `effectiveFrom = User.createdAt` · D-16 เปิด `btree_gist`
- D-4 งบต่อรอบ = งบเดือน × วันในรอบ ÷ ผลรวมวันของทุกรอบที่ผูกกับเดือนนั้น ปัดเป็นสตางค์ รอบสุดท้ายรับเศษ ผลรวมเท่ากับงบเดือนเสมอ ต้องทดสอบวันเงินเข้า 29–31 รวมกุมภาพันธ์ปีปกติและปีอธิกสุรทิน
- D-20 รอบที่คร่อมสองเดือนผูกกับ `Budget` ของเดือนที่รอบเริ่ม
- D-7 / D-8 / D-10: ค่าเริ่มต้นคือไม่แสดงตัวเลขพยากรณ์ ถ้าเลี่ยงไม่ได้ ตัวเลขระดับ 7 วันปัดเป็นหลักร้อย เตือนเมื่อยอดที่คาดว่าจะเกินมากกว่า 174.48 × จำนวนวันในช่วง ÷ 7 บาท (MAE 7 วันจาก synthetic backtest) ไม่มีระยะเผื่อเพิ่ม
- D-9 fallback ก่อนผ่าน Forecast Gate: มัธยฐานของยอดรวมรายวันเฉพาะวันที่มีรายการ × (วันที่มีรายการ ÷ วันที่นับ) ย้อนดู 30 วัน บันทึกมาแล้ว ≥ 7 วัน และมีรายการ ≥ 3 วันที่ต่างกัน (จำนวนน้อยที่สุดที่ค่าสุดโต่งค่าเดียวเป็นมัธยฐานไม่ได้) ต้องทดสอบกรณีมีรายการ 1, 2, 3 วัน และยอดใหญ่ 1 ใน 3 วัน
- D-11 ไม่ตัดรายการผิดปกติออกจาก fallback · D-12 รอบนี้ไม่เพิ่มประเภทการโอนเข้าบัญชีออม · D-17 เก็บทางเลือก "เพิ่มรายได้"
- ยกเลิก: D-14 (mapping ความตั้งใจ), D-18, D-19, D-19b (สูตรถ่วงน้ำหนัก)

## ยังต้องตัดสินใจ / ยังไม่มีหลักฐานยืนยัน

| เรื่อง | สถานะและสิ่งที่ห้ามอนุมาน |
|---|---|
| Recommendation Engine | ขอบเขตแหล่งข้อมูลยืนยันแล้ว (Behavior/Forecast/Goals) แต่กฎ เกณฑ์ และรูปแบบคำแนะนำยังไม่ได้กำหนด ห้ามเดา |
| Data Readiness กลาง | ยังไม่นิยามหมวดที่จำเป็นและนโยบายหยุด; ตอนนี้มีเพียง readiness แยกต่อโมดูล |
| Automatic Anomaly amount matching / absolute floor | ยังปิด; helper ที่มีอยู่ไม่ได้เท่ากับสิทธิ์เปิดหรือเลือกค่าจริง ดู [experiment](../ANOMALY_TOLERANCE_EXPERIMENT.md) |
| Production password reset | การเลือกprovider/sender, rate policy, secret provisioning และhosting headersต้องตัดสินใจ/ตรวจ deployment แยก การมีadapterไม่แปลว่าส่งเมลจริงได้แล้ว |
| Node support / production deployment / bootstrapฐานหลัก | ไม่พบข้อกำหนดที่ครบในไฟล์ที่ตรวจ จึงยังไม่ประกาศ supported version, production runbook หรือขั้นตอน migrateฐานหลักอัตโนมัติ |
| User Acceptance ล่าสุดของ Behavior | พบประวัติตรวจรับรุ่นเก่าและผลsynthetic testsใหม่ แต่ยังไม่มีการยืนยันโดยผู้ใช้สำหรับrevisionลดการ์ดซ้ำ และ `behavior-v3` (tolerance/ขั้นต่ำยอดเพิ่ม) ห้ามขยายผลacceptanceเดิม |
| Local .env.example | มีค่ารหัสผ่านที่ไม่เหมาะเป็นtemplate ต้องสะสางในงานconfig/securityแยก; งานนี้ไม่เปลี่ยนค่า ไม่เผยค่า และไม่ตัดสินใจแทนเจ้าของ |

ผลทดสอบที่ผ่านมาเป็นหลักฐานแยกจากการยืนยันข้อกำหนดหรือ User Acceptance และไม่ทำให้ประเด็น pending กลายเป็น approved
