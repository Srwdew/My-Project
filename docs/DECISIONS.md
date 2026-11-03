# Current behavior, confirmed requirements and pending decisions

ร่างทะเบียน ณ 21 ตุลาคม 2026 ปรับ 24 ตุลาคม 2026 ตามคำยืนยันของผู้ใช้ อ้าง working tree ไม่ใช่เฉพาะ HEAD ตารางนี้เป็นสรุปประเด็นที่ตรวจ ไม่ใช่ทะเบียนข้อกำหนดครบทุกโมดูล

## พฤติกรรมปัจจุบันที่เห็นใน source

| เรื่อง | สิ่งที่ source ทำ | หลักฐาน |
|---|---|---|
| API routing | dev /api ผ่าน Vite proxy ไป 4000; non-dev ใช้ VITE_API_URL หรือ /api | [api.ts](../frontend/src/api.ts), [vite.config.ts](../frontend/vite.config.ts) |
| Forecast | Theta (θ=2) ยอดรวมรายวัน (เดิม Holt จนถึง 3 พ.ย. 2026), readiness lifetime ถึงเมื่อวาน 30 รายจ่าย/ระยะ30วัน, fitting ไม่เกิน180วัน, forecast7วัน | [expenseForecast.ts](../backend/src/lib/expenseForecast.ts), [holt.ts](../backend/src/lib/holt.ts) |
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
- C3 (ตัดสินตอนใช้ Holt ยังใช้กับ Theta ตั้งแต่ 3 พ.ย. 2026): Holt ใช้รายจ่ายทั้งหมดเหมือนเดิม (`MODEL_VERSION` ไม่เปลี่ยน) เพราะ anomaly detector ตีความการเปลี่ยนระดับถาวรว่าผิดปกติ ส่วน Holt มีหน้าที่ตามการเปลี่ยนระดับ จึงต้องแยก input ของสองโมดูลจากกัน หลักฐาน synthetic: level-change MAE 8.55 → 126.98 ([รายงาน](FORECAST_ANOMALY_EXCLUSION_BACKTEST.md)) การคัดเฉพาะรายการที่ผู้ใช้ยืนยันเป็น future work
- ISSUE-TEST-2 (ปิดส่วนการครอบคลุม 3 พ.ย. 2026 ด้วย `backend/tests/runAll.cjs` และ `npm test`, ไฟล์ที่ไม่ถูกจัดกลุ่มนับเป็นล้ม; ส่วนที่ยังเปิดดู ISSUE-TEST-4; ข้อความต่อไปนี้คือบันทึกเดิม, บันทึก 2 พ.ย. 2026): `backend/tests/runIsolatedDatabase.cjs` **ไม่ใช่ตัวรันเทสต์ฐานข้อมูลทั้งหมด** ครอบคลุม 10 ชุด (anomaly, anomalyDimensions, anomalyReview, anomalyTolerance, anomalyLevelShift, behavior, forecast, goals, recommendations, flexibleCategories) ผลจากตัวรันนี้ต้องรายงานว่า "N/N จาก 10 ชุดที่ตัวรันครอบคลุม" ไม่ใช่ "ผ่านหมด" ชุดที่ไม่ถูกรัน 15 ชุด: admin, closedAccountExperiment, cycleDefaults, dashboard, defaultCategories (ต้องชื่อฐาน `spendsense_goals_test_categories_`), goalSavingsPlan, overviewGoals (`..._overview_`), passwordReset, reconciliation, settings, setup, setupInvitation, transactionCreateRequest (`..._ocr_`), transactionsByDate, transactionsLimit หลายชุดมีตัวรันของตัวเอง (`tests/run*.cjs`) **อาการที่พบ (ยังไม่หาสาเหตุ):** ลองรันทุกไฟล์ด้วยตัวรันนี้ครั้งเดียว ได้ 135/143 ล้ม 8: admin, defaultCategories, goalSavingsPlan, overviewGoals, passwordReset, transactionCreateRequest ล้มทั้งไฟล์ (คาดว่าเพราะ guard ชื่อฐานหรือ env ของตัวรันเฉพาะ ยังไม่ยืนยัน) และ reconciliation ล้มที่ "PostgreSQL HTTP reconciliation against independent integer-satang totals" หลังรัน 123 วินาที
- ISSUE-TEST-3 (แก้แล้ว 3 พ.ย. 2026): เทสต์บางไฟล์ต่อฐานตาม `backend/.env` ได้ถ้ารันตรงจาก `backend/` เพราะ `src/lib/prisma.ts` โหลด dotenv ตอน import ไม่พบหลักฐานว่าเคยเกิดกับฐานหลัก และไม่ได้ตรวจย้อนหลัง
  - ไฟล์ที่ไม่มี guard ชื่อฐาน: `reconciliation.database.test.ts` (query จริง อ่านผู้ใช้ทุกคนและเขียนใน transaction ที่ rollback), `budgetNotifications.database.ts` (query จริง rollback), `notifications.http.test.ts` (ใช้ Prisma double ตามคอมเมนต์ในไฟล์ แต่โหลด client จริง) ส่วนชุด `*.database.test.ts` อื่นทั้ง 24 ชุดมี guard อยู่แล้ว
  - ไฟล์ที่ import prisma ทางอ้อมหรือ mock เอง ไม่มี guard ของตัวเองและไม่ต้องต่อฐาน: `budgetNotifications.test.ts`, `cycle.test.ts`, `anomalyLevelShift.test.ts`, `goalSavingsPlan.test.ts` ถ้ามี query หลุด guard กลางจะทำให้ล้มแทนการต่อฐาน
  - แก้สองชั้น: guard ชื่อฐานในสามไฟล์ข้างบน และ guard กลาง `src/lib/testDatabaseGuard.ts` ที่ `prisma.ts` เรียกตอนโหลด เมื่อรันใต้ `node --test` หรือจากสคริปต์ในโฟลเดอร์ `tests/` แล้วฐานไม่ใช่ loopback + `spendsense_*test_*` จะเขียนทับ `DATABASE_URL` เป็นปลายทางที่ต่อไม่ได้ ไฟล์ใหม่จึงได้ guard โดยไม่ต้องจำใส่
  - ปิดเส้นทาง browser (3 พ.ย. 2026): harness ทุกตัวเรียก `tests/browserGuard.cjs` จึงรันได้ผ่าน `npm run test:browser` เท่านั้น ตัวรัน build `dist` ใหม่ทุกครั้งและตรวจว่ามี guard, ปฏิเสธเมื่อพอร์ต 4000 มีคนใช้ (mock พลาดผ่าน proxy `/api` จะไปถึง backend ที่ต่อฐานหลักได้), เปิด API เองบนฐานชั่วคราวโดยปิด dotenv และส่ง `SPENDSENSE_TEST_RUN=1` ให้ guard กลางทำงานในเซิร์ฟเวอร์นั้น
  - `src/cli/admin.ts` ไม่โหลด dotenv ต้องระบุ `DATABASE_URL`, `--database-name` และ `--database-host` ให้ตรงกัน กันการสั่งผิดเป้าหมาย แต่ไม่ได้ห้ามฐานหลักเพราะเป็นเครื่องมือ operator; `npm run dev` และ `prisma/seed.ts` โหลด `.env` ตามปกติ ไม่นับเป็นเทสต์
  - **ส่วนที่ยืนยันไม่ได้:** มีหลักฐานเอกสารว่าน่าจะเคยรันกับฐานหลักอย่างน้อยสองครั้ง: `NOTIFICATIONS_IMPLEMENTATION.md` บันทึก `budgetNotifications.database.ts` "ผ่านกับ PostgreSQL จริง" และ `RECONCILIATION_REPORT.md` บันทึก "บัญชีเดิม 4 บัญชี" (ก.ย. 2026) โดยคำสั่งไม่ระบุฐานแยก เอกสารไม่ระบุชื่อฐาน และไม่ได้ query ฐานหลักตามคำสั่ง จึงยืนยันไม่ได้ว่าเป็นฐานหลักและยืนยันไม่ได้ว่าไม่มีร่องรอยค้าง
  - ความเสี่ยงข้อมูล: การเขียนใน transaction ที่ล้มกลางคันจะถูก PostgreSQL ยกเลิกเอง และรายงานเดิมระบุว่าตรวจแล้ว fixture เหลือศูนย์ ไฟล์เทสต์ทั้งสี่ไม่มีการเขียนไฟล์ ส่งอีเมล หรือเรียก API ภายนอก (fetch ไปแค่ loopback) ช่อง 7 model ของ reconciliation ไล่แล้ว (3 พ.ย. 2026): การเขียนตรงนอก 7 model ใน `backend/src` มีจุดเดียวคือ `recommendationLog.updateMany` ใน route ที่เทสต์นี้ไม่เรียก และเมื่อรันเทสต์บนฐานชั่วคราวแล้วนับทุกตาราง ไม่มีแถวค้าง (ก่อน 0, หลัง 0, ผ่าน 13) ข้อสรุปนี้ใช้กับโค้ดปัจจุบัน ไม่ครอบเวอร์ชันเก่าตอนรันจริงเมื่อ ก.ย. 2026 ถ้าจะตรวจข้อมูลให้ค้นอีเมล `reconciliation-*@example.invalid` และ `notification-test-*@example.invalid` ซึ่งต้องได้รับอนุญาตแยก
- ISSUE-TEST-4 (เปิดอยู่, 3 พ.ย. 2026): ผลรันครั้งแรกของ `runAll.cjs` unit 28/28 ไฟล์, db 25/28, browser 4/23 ล่าสุด db 27/28, browser 7/23 ผลรายการที่ล้มเหมือนกันทั้ง working tree และ frontend จาก HEAD จึงไม่ได้เกิดจากไฟล์ที่ยังไม่ commit
  - **Regression (ISSUE-UI-1):** หน้า Behavior ไม่มีข้อความ "วันที่ไม่มีรายการไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง..." เพราะถูกลบใน `a4b0b75` (commit รวม ข้อความ commit ไม่ได้พูดถึง) เจอได้เพราะ `behavior.browser` ผู้ใช้ยืนยันว่าไม่ได้ตั้งใจลบ เอาประโยคเดิมกลับมาแล้ว (3 พ.ย. 2026) ไม่ใส่ท่อนท้าย "ยังเปรียบเทียบแบบแผนไม่ได้ จึงงดข้อค้นพบเปรียบเทียบ" กลับ เพราะหน้ามี "ยังเปรียบเทียบไม่ได้: ข้อมูลบางช่วงไม่พร้อม" สำหรับกรณีเดียวกันอยู่แล้ว การใส่ซ้ำจะซ้ำซ้อน ผู้ใช้เห็นด้วย `a4b0b75` เปลี่ยนข้อความในหน้าจำนวนมาก ต้องทบทวนว่าข้อความเตือนอื่นหายด้วยหรือไม่
  - พฤติกรรมหมวดเริ่มต้น: `GET /categories` สร้างหมวดเริ่มต้นเมื่อถูกเรียก บัญชีเดิมจึงเห็นหมวดด้วย มีใน `195cf1c` (21 ต.ค. 2026) และ `e90f761` ระบุ "default categories" ในรายการงานรวม ไม่มีข้อความไหนบอกเจตนาตรง ๆ และไม่เคยมีบันทึกการตัดสินใจก่อนหน้านี้ จึงถือว่าตั้งใจตามที่ผู้ใช้ยืนยัน (3 พ.ย. 2026) ไม่ใช่มีบันทึกว่าตั้งใจ แก้เทสต์แล้ว
  - Container ที่เก็บไว้: `spendsense-anomaly-uat-1791744993271` (4 บัญชี, 254 รายการ) และ `spendsense-admin-acceptance-1791527633837` (2 บัญชี, 31 รายการ) เป็นอีเมลสังเคราะห์ เก็บเป็นหลักฐาน UAT จนกว่าจะยืนยันว่าไม่ต้องใช้
  - Container ที่ลบแล้วตามคำสั่งผู้ใช้ (3 พ.ย. 2026) พร้อม anonymous volume เพราะอาจมีอีเมลจริง: ชุด behavior UAT (10 บัญชี, 328 รายการ) และชุด category acceptance (7 ฐาน) หลักฐาน UAT ที่มีค่าคือรายงานและตัวเลข ไม่ใช่ฐานที่มีอีเมลจริง นอกจากนี้ลบชุด behavior UAT ที่ฐานเปล่า 1 ตัว และของตัวรันเทสต์ 41 ตัว
  - แก้แล้ว: `admin.database` (เทสต์ allowlist เก่า เพิ่ม `memberNo`), `transactionsLimit.database` (สมมติว่ามี category ในฐาน ตอนนี้สร้างเอง), mock `/auth/me` กลางใน `browserGuard.cjs`
  - `defaultCategories.browser`: ตัวรันส่งบัญชีครบแล้ว แต่เทสต์คาดว่าบัญชีเดิมไม่มีหมวด ขณะที่ `GET /categories` สร้างหมวดเริ่มต้นให้ตั้งแต่ `e90f761` รอยืนยันว่าตั้งใจหรือไม่
  - `passwordReset.database`: subtest browser รอ frontend ที่ `localhost:5173` ซึ่ง `test:db` ไม่เปิด (สาเหตุจากการอ่านโค้ด)
  - browser: mock `/auth/me` เก่า ไม่มี `role`/`showSetup` ที่ `ProtectedRoute` ต้องการตั้งแต่ ต.ค. 2026 ยืนยันแล้วใน settings ส่วนชุดอื่นที่ค้างหน้า protected น่าจะสาเหตุเดียวกันแต่ยังไม่ยืนยันทีละชุด
  - `budgetNotifications.database`: ส่วน concurrency ข้ามตัวเองเมื่อไม่มีบัญชีเดิม (พิมพ์ SKIP)
  - ตัวรันเดิม 16 ตัวไม่ถูกเรียก ส่วนใหญ่เก็บฐานหรือ container "ไว้ตรวจ" ตอนนี้มี container หยุดค้าง 46 ตัว เก็บ `runPasswordReset`, `runSetupMigration`, `runAnomalyDimensionsUpgrade` เพราะตรวจเส้นทางอัปเกรดซึ่ง `npm test` ไม่ครอบ อีก 13 ตัวน่าจะเลิกใช้ได้ ยังไม่ลบ
- ISSUE-ANOM-1 (ปิด 2 พ.ย. 2026, สรุปและข้อจำกัดใน [ANOMALY_LEVEL_SHIFT_BACKTEST](ANOMALY_LEVEL_SHIFT_BACKTEST.md); การจับรายการประจำที่หายไปย้ายเป็นงานต่อยอด): amount screen flag รายการต่อเนื่องทุกรายการเมื่อรายจ่ายขึ้นระดับถาวร (390 รายการใน backtest) ผู้ใช้ปลดล็อก `ANOMALY_RULE` ให้แก้แล้ว (2 พ.ย. 2026)
  - สาเหตุ: `anomaly_dimension_exclusion` ตัดรายการ flagged-unreviewed ออกจาก baseline baseline จึงไม่เคยเห็นระดับใหม่ (390 = ทุกรายการหลังการขยับใน fixture level-change, 130 วัน × 3 seeds) หน้าต่าง 180 วัน, median/MAD และเกณฑ์ modified z 3.5 คงเดิม
  - ขั้นที่ 1: ตัวตรวจการขยับระดับ (5 จาก 7 รายการล่าสุดในหมวดถูก flag ทิศเดียวกัน ขาลงใช้เกณฑ์สมมาตร) ตาราง `AnomalyLevelShift` append-only ระหว่างรอผู้ใช้ยืนยันยังคง flag แต่ยุบเป็นรายการเดียวในคิว เมื่อยืนยันแล้ว ระบบบันทึก decision `normal` แยกทีละรายการ (อ้างการยืนยัน ผูก revision) วัด 390 → X
  - ⚠️ ขั้นที่ 1 เพิ่มค่าใน `ANOMALY_RULE` ทำให้ `RULE_VERSION` เปลี่ยน `reconcileAnomalies` จะประเมินรายจ่ายย้อนหลังทุกรายการของผู้ใช้ที่เปิดแจ้งเตือนใหม่ **ห้ามรันโค้ดนี้กับฐานหลักก่อนงานเสร็จและผู้ใช้อนุมัติ** วิธีวัดอยู่ใน [ANOMALY_LEVEL_SHIFT_BACKTEST](ANOMALY_LEVEL_SHIFT_BACKTEST.md)
  - ขั้นที่ 2 (ใช้แล้ว 2 พ.ย. 2026, `RULE_VERSION` เปลี่ยนอีกครั้ง; ผล: X → Y ไม่เปลี่ยน, ตรวจพบผิด 0 → 0, ช่วงเงียบหลังยืนยัน 30 → 15 วัน ดู [ANOMALY_LEVEL_SHIFT_BACKTEST](ANOMALY_LEVEL_SHIFT_BACKTEST.md)): ขั้นต่ำมิติยอดต่อหมวด 30/10/28 → **10 รายการ / 5 วันที่ต่างกัน / ช่วงห่าง ≥ 14 วัน** วัด X → Y หลักฐาน (`scripts/forecast-experiment/category-minimum.ts`, MoneyData M1 หน้าต่าง 180 วัน 1,217 คู่หมวด-เดือน): รายการที่ได้ใช้ baseline ของหมวดตัวเอง 65% → 90% (หมวด 23% → 53%) ลดเป็น 8 ได้เพิ่มแค่ 3% (93%) ขณะที่ median/MAD จาก n น้อยแกว่งขึ้น **ข้อจำกัด:** หลักฐานมาจาก MoneyData บัญชีเดียว Berka ใช้ไม่ได้เพราะมีแค่ประเภทธุรกรรม ไม่มีหมวดการใช้จ่ายจริง
- ISSUE-ANOM-2 (เปิดอยู่, บันทึก 2 พ.ย. 2026, ยังไม่แก้): หมวดที่ระดับต่างจากทั้งบัญชีมากและข้อมูลไม่ถึงขั้นต่ำ ถูก flag ทุกรายการและล็อกตัวเอง มีอยู่ก่อน ISSUE-ANOM-1 ตัวตรวจการขยับไม่ได้สร้าง แต่ทำให้ปรากฏเป็นคำถาม "ขยับเป็นระดับใหม่หรือไม่" ที่ข้อความผิด
  - กลไก: (1) หมวดที่ยังไม่ถึงขั้นต่ำใช้ baseline ทั้งบัญชี ถ้าระดับหมวดต่างจากบัญชีมาก (fixture: edge ราว 300, sparse ราว 500 เทียบ primary 100–250) รายการแรกๆ ถูก flag ทุกตัว (2) `anomaly_dimension_exclusion` ตัดรายการ flagged-unreviewed ออกจาก baseline ของหมวด หมวดจึงสะสมไม่ถึงขั้นต่ำ (3) flag ทุกรายการไปตลอด เป็นการล็อกตัวเองแบบเดียวกับ ISSUE-ANOM-1 แต่ในหมวดข้อมูลน้อย (4) ตัวตรวจเห็น 5 ใน 7 ถูก flag จึงถามว่า "ขยับตั้งแต่วันที่…" ทั้งที่ความจริงคือ "สูงกว่าค่าเฉลี่ยทั้งบัญชีมาตลอด"
  - ตัวเลข (fixture หลายหมวด 3 seeds ระบบเดิม): flag edge 48, sparse 25 ไม่มีหมวดใดขยับจริง edge ไม่เคยได้ใช้ baseline ของตัวเองเลย (0 ครั้ง) แม้ที่ 10/5/14 ตรวจพบผิด edge 3, sparse 3 (โหมดไม่ตอบ) เท่ากันทั้ง 30/10/28 และ 10/5/14
  - แนวทางที่เป็นไปได้: (ก) ไม่ให้ตัวตรวจทำงานกับรายการที่ประเมินด้วย baseline ทั้งบัญชี (ใช้ `snapshot.scope.amount` ที่บันทึกอยู่แล้ว แก้เฉพาะ TypeScript แต่หมวดเหล่านี้กลับไป flag ทีละรายการ) (ข) ให้ flagged-unreviewed นับเข้าเกณฑ์ขั้นต่ำของหมวด หรือแยก baseline ระดับบัญชีออกจากการคัดออก **ต้องแก้ SQL `anomaly_dimension_exclusion` ซึ่งกระทบทุกมิติ** (ค) เปลี่ยนข้อความการ์ดเมื่อมาจาก baseline ทั้งบัญชี (ข้อความต้องให้ผู้ใช้อนุมัติ) ไม่แก้ตอนนี้เพราะเหลือเวลาสี่สัปดาห์และมีงานที่กระทบรายงานมากกว่า
- ISSUE-TEST-1 (เปิดอยู่, บันทึก 2 พ.ย. 2026): บล็อก Goals ท้าย `backend/tests/overviewInsights.browser.cjs` หมดเวลาที่ `[data-testid=goal-feasibility]` พังมาก่อนงาน Recommendation Engine บล็อกคำแนะนำ 4 บล็อกก่อนหน้าผ่าน แก้ความเข้าใจ (3 พ.ย. 2026): บล็อกนี้เดินไปหน้า Goals และ `a4b0b75` เอา `<GoalFeasibility>` ออกจากหน้า Goals จึงเป็นผลของ ISSUE-UI-4 ไม่ใช่เทสต์เก่า รอผู้ใช้ตัดสิน
- ISSUE-UI-2 (เปิดอยู่, 3 พ.ย. 2026): ผู้ใช้กลับไปฟอร์ม Setup ไม่ได้อีก ปุ่ม "เปิดฟอร์ม Setup" ในหน้า Settings ถูกถอดออกเพราะใช้ไม่ได้กับทุกบัญชีที่เปิด Settings ได้ แก้รายได้ที่หน้า Settings แทน ถ้าจะทำกลับต้องแก้สองจุด: `ProtectedRoute.tsx` (`setupPage&&!state.required` ส่งไป `/overview`) และเส้นทางเข้าจาก Settings เคยมีสองความเข้าใจพร้อมกัน: `settings.browser` คาดว่าเปิดได้ ส่วน `setupCompletion.browser` คาดว่าถูกส่งไป `/overview`
- ISSUE-UI-3 (เปิดอยู่, 3 พ.ย. 2026): แอปไม่มี ErrorBoundary error ตอน render ทำให้ขาวทั้งแอป เจอจาก mock ที่ส่งรูปแบบผิด ควรมีก่อนใช้งานจริง ยังไม่ทำ
- ISSUE-UI-4 (เปิดอยู่, รอผู้ใช้ตัดสิน, 3 พ.ย. 2026): `a4b0b75` เอาส่วนเทียบงบของ Forecast และ `<GoalFeasibility>` ของ Goals ออกจากหน้าจอ ข้อความ commit ไม่ได้พูดถึง ผู้ใช้ไม่ได้ตั้งใจและจำไม่ได้ว่าอนุมัติ backend ยังคำนวณ `budgetComparison` (ใช้ต่อใน `goalForecastSignal`) แต่หน้า Forecast มีแค่ type ไม่อ่านค่า ขณะที่หน้า Guide ยังอธิบาย "การเทียบงบ" เอกสารจึงไม่ตรงกับระบบ ส่วน Goals แสดงแค่บางส่วนของ feasibility: สถานะอื่นนอกจาก `exceeds_observed_cash_flow` และข้อความข้อจำกัดไม่ขึ้น
- ISSUE-UI-1 ต่อ (3 พ.ย. 2026): เอาข้อความเตือนกลับ 4 จุดด้วยคำตามหน้าปัจจุบัน (Goals กันเงิน, Behavior รูปแบบซ้ำและคำแนะนำ, Overview อัตราการออม) และเติม Forecast ห้ามคืนเกณฑ์ละเอียดเดิมของ Behavior เพราะขัดกับเกณฑ์ 24 ต.ค. ข้อความ `GoalFeasibility` ขึ้นกับ ISSUE-UI-4 ข้อความกันบันทึกซ้ำของ Addtransaction ยังไม่ตรวจ
- ข้อจำกัด: backtest ข้างบนใช้ข้อมูลสังเคราะห์ ส่วน dataset อ้างอิง (Bank Transactions Dataset / Mendeley และ Berka / PKDD'99) อยู่ใน [FORECAST_REAL_DATA_BACKTEST](FORECAST_REAL_DATA_BACKTEST.md) ซึ่งแนะนำ Theta แทน Holt
- **โมเดลพยากรณ์: Theta (θ=2) แทน Holt ตั้งแต่ 3 พ.ย. 2026** (ล็อกเดิม: Holt ยอดรวมรายวัน fixed 0.2/0.1 ต่ำกว่า 42 วัน จูน inner fold ตั้งแต่ 42 วัน) เหตุผลจาก backtest ข้อมูลจริง [FORECAST_REAL_DATA_BACKTEST](FORECAST_REAL_DATA_BACKTEST.md) ข้อ 6 โค้ด production ([theta.ts](../backend/src/lib/theta.ts)) รันผ่าน backtest เดียวกันแล้วได้ผลตรงทุกไบต์ `MODEL_VERSION` `theta-total-v1-8b38067e42004e0b` horizon 7, gate 30/30, D-8 และ C3 (รับรายจ่ายทั้งหมด) คงเดิม Holt เหลือเป็นคอลัมน์อ้างอิงใน backtest เท่านั้น (`HOLT_REFERENCE` ห้ามแก้)
  - ข้อจำกัดที่รู้แล้ว: bias ติดลบเล็กน้อยบน Berka (−9.46%, −10.11%) อาจทายยอด 7 วันต่ำกว่าจริงเล็กน้อย; ตามการขยับระดับใหม่ได้ช้าเพราะ α ต่ำ (ราว 0.02) เป็นเรื่องเดียวกับ ISSUE-ANOM-1 คนละรูปแบบ (anomaly มองระดับใหม่เป็นความผิดปกติ Theta มองเป็น noise)
  - เส้นเตือน D-10 คำนวณใหม่ด้วย Theta แล้ว (3 พ.ย. 2026) ดูบรรทัด D-7 / D-8 / D-10 ด้านล่าง
- ISSUE-FC-1 (เปิดอยู่, บันทึก 3 พ.ย. 2026, ยังไม่แก้): หน้าพยากรณ์แสดงยอด 7 วันละเอียดถึงบาท (เช่น 1,091) ส่วนคำแนะนำ (R1) ปัดหลักร้อยตาม D-8 ผู้ใช้อาจเห็นสองตัวเลขไม่ตรงกัน ตั้งใจไม่ลาก D-8 ไปใช้กับหน้าพยากรณ์ เพราะ D-8 อยู่ในขอบเขต Financial Profile / Alert Layer / Recommendation และหน้านี้มีกราฟรายวัน ถ้าปัดทั้งยอดรวมและรายวัน ผลรวมในกราฟจะไม่เท่ากับยอดรวม
- เกณฑ์คำว่า "แนวโน้ม" บนหน้าพยากรณ์ (3 พ.ย. 2026): เรียกว่ามีแนวโน้มสูงขึ้น/ลดลงเมื่อยอด 7 วันที่คาดต่างจาก 7 วันก่อน ≥ 5% **และ** ≥ 100 บาท ทั้งสองทิศ ต่ำกว่านั้นเขียน "ใกล้เคียงกับสัปดาห์ก่อน" แต่ยังแสดงตัวเลขจริง (เช่น +1.0%) ยืมจากเกณฑ์ยอดเพิ่มของ Behavior (`BEHAVIOR_RULE.minimumIncreaseShare` / `minimumIncreaseAmount`, ยืนยัน 24 ต.ค. 2026) ซึ่ง R9 ยืมเส้น 100 บาทไปแล้ว ข้อต่างบริบท: Behavior ใช้กับยอดรายหมวดเทียบเดือนต่อเดือนและเฉพาะขาขึ้น ที่นี่ใช้กับยอดรวมพยากรณ์ 7 วันเทียบ 7 วันจริงก่อนหน้า และใช้กับขาลงด้วย ล็อกเพิ่ม (3 พ.ย. 2026): ถ้า 7 วันก่อนเป็น 0 บาท ไม่มีเปอร์เซ็นต์ ใช้เส้น 100 บาทอย่างเดียว ตอน "ใกล้เคียง" ไม่แสดงลูกศร โค้ด [forecastTrend.ts](../frontend/src/utils/forecastTrend.ts) เทสต์ `backend/tests/forecastTrend.test.ts`
- บทเรียน (3 พ.ย. 2026): เวลาแทนค่าที่ล็อกไว้ ให้ค้นด้วยตัวเลขเปล่า (เช่น `174.48`) ทั้ง repo ไม่ใช่ค้นด้วยบริบทรอบตัวเลข รอบ D-10 คำสั่งแทนที่ที่ผูกกับ `|S|` พลาดบรรทัดที่เขียน `|S₁|` (แก้ใน c2cd918)
  - ⚠️ **ตัวประกอบความเชื่อมั่นของ R1 (`forecastFactor`) ไม่ทำงานจริง:** สเปกให้ลดความเชื่อมั่นตามความกว้างของช่วงพยากรณ์ แต่ Theta ในระบบไม่คืนช่วง ค่าจึงเป็น 1 ทุกครั้ง (บันทึก `forecastFactorFallback: true` ใน inputs) R1 จึงเรียงตามคะแนนโดยไม่มีส่วนลดจากความไม่แน่นอนของพยากรณ์ (เหมือนสมัย Holt ซึ่งก็ไม่คืนช่วง)
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
- D-7 / D-8 / D-10: ค่าเริ่มต้นคือไม่แสดงตัวเลขพยากรณ์ ถ้าเลี่ยงไม่ได้ ตัวเลขระดับ 7 วันปัดเป็นหลักร้อย เตือนเมื่อยอดที่คาดว่าจะเกินมากกว่า 92.57 × จำนวนวันในช่วง ÷ 7 บาท ไม่มีระยะเผื่อเพิ่ม
  - ที่มา 92.57: MAE ยอดรวม 7 วันของ Theta (production `buildForecast`) บน synthetic benchmark ชุดเดิม 412 จุดตัด ([FORECAST_TOTAL_BACKTEST_REPORT](../FORECAST_TOTAL_BACKTEST_REPORT.md), commit aae81b1)
  - ประวัติ: เดิม 174.48 = MAE เดียวกันของ Holt (รันซ้ำบนชุดเดียวกันได้ 174.48 ตรง) เปลี่ยน 3 พ.ย. 2026 เพราะ production เปลี่ยนเป็น Theta; Theta พลาดน้อยกว่าในชุดรอบสัปดาห์และชุดเปลี่ยนระดับ
  - เหตุผลปัดหลักร้อย (เขียนใหม่ 3 พ.ย. 2026): 92.57 เป็นค่าเฉลี่ย ไม่ใช่ความคลาดเคลื่อนที่เจอทุกครั้ง ชุดยอดพุ่งเป็นครั้งได้ MAE 7 วัน 401.48 และชุดใช้จ่ายเว้นวันได้ 170.87 สูงกว่า 100 มาก การปัดตั้งตามความคลาดเคลื่อนที่เลวร้ายได้ ไม่ใช่ตามค่าเฉลี่ย เพราะเลขละเอียดกว่าที่โมเดลแม่นจริงคือการบอกผู้ใช้ว่าระบบมั่นใจกว่าที่เป็น (เหตุผลเดิม "MAE 174.48 > 100" ใช้ไม่ได้แล้ว)
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
