# Transaction screening implementation

ตรวจและพัฒนา 23–24 กันยายน 2026 (Asia/Bangkok) — ยังไม่ stage/commit/push และยังไม่ apply migration กับฐานใช้งานจริง

## ขอบเขตและกฎ v1

ระบบคัดกรองรายการที่ควรตรวจสอบด้วยกฎสถิติ ไม่ใช่การยืนยันการทุจริตหรือโมเดล AI/ML ไม่มี dependency ใหม่ และไม่มีหน้าใหม่

- Expense ของ auth user และหมวดเดียวกันย้อนหลัง [วันที่รายการ − 180 วัน, วันที่รายการ) ไม่รวมวันรายการ ไม่ใช้ createdAt หรือข้อมูลบัญชีอื่น
- จำนวนเงิน: อย่างน้อย 30 รายการ, 10 วันที่มีรายการ, span=maxDate−minDate >=28 วัน
- median/MAD และ modified Z = 0.6745 × (X−median) / MAD เมื่อ MAD>0; flag เมื่อ Z>3.5 และส่วนต่าง >max(100 บาท, 50% median) ใช้ Decimal เปรียบเทียบแบบคูณไขว้
- MAD=0/IQR>0: X>Q3+3×IQR และส่วนต่างเกิน floor เดียวกัน Quartile เป็น median ของครึ่งล่าง/บน ตัดสมาชิกกลางเมื่อจำนวนคี่
- MAD=IQR=0 และ min=max: X>median และ X−median>max(100 บาท,50% median), reasonCode=amount_zero_dispersion
- MAD=IQR=0 แต่ min!=max: amount_zero_iqr_nonconstant / not_evaluated ไม่เดา threshold เพิ่ม
- ทุก threshold ที่ใช้ flag เป็น strict: เท่ากันไม่ flag
- เวลา: เฉพาะ transactionTimeConfirmed=true และ time มีค่า, Bangkok wall-clock ใน @db.Time(0)/UTC surrogate ไม่แปลงจาก createdAt
- ขั้นต่ำเวลายืนยัน 60 รายการ/20 วัน/span42 วัน และ coverage>=80% ของ expense ใน baseline; bucket 00–04,04–08,...20–24 (ขอบบน exclusive) ความถี่ bucket <5% และช่วงวงกลม [เวลา−2ชม.,เวลา+2ชม.) <5% ทั้งคู่ เพื่อไม่เตือนเทียมตรงเที่ยงคืน
- ข้อมูลไม่พอแยก not_evaluated ต่อด้าน ไม่ใช้หมวดอื่นแทน; outcome รวม flagged ถ้ามีสัญญาณอย่างน้อยหนึ่งด้าน
- review_priority เมื่อพบสองด้านหรือ modified Z>5; นอกนั้น review ไม่มีคำกล่าวอ้างความแม่นยำ
- constants ทุกค่ารวมใน ANOMALY_RULE; ruleVersion เป็น algorithm + SHA256 ของ JSON constants (24 hex) snapshot เก็บ constants ณ เวลาตรวจ

## Schema / migration

Migration ใหม่เพียง 20260923010000_add_transaction_anomaly มี .gitattributes migration.sql -text

Transaction เพิ่ม transactionTimeConfirmed=false, anomalyRevision=0, anomalyPending=false; CHECK revision>=0, confirmed ต้องมีเวลา, pending ต้องเป็น expense; index(userId,categoryId,transactionDate) และ partial index(userId,id) WHERE anomalyPending=true

AnomalyNotificationSetting: userId PK/FK, enabled=false, updatedAt. API ใช้ชื่อ notifyAnomaly

AnomalyEvaluation: id, userId, originalTransactionId (ไม่มี FK ไป Transaction เพื่อเก็บประวัติหลังลบ), revision, ruleVersion, evaluatedAt, outcome, snapshot JSONB; unique(userId,originalTransactionId,revision,ruleVersion), index(userId,originalTransactionId,revision)

PostgreSQL anomaly_evaluation_guard BEFORE INSERT/UPDATE/DELETE ปฏิเสธ UPDATE/DELETE และตรวจ live expense, user ownership, revision เมื่อ INSERT. Snapshot เก็บเฉพาะรายการ/ตัวเลขสรุป baseline/กฎ/เหตุผล ไม่เก็บ token/password/request body

anomaly_numeric_median(numeric[]) คำนวณ median ใน PostgreSQL แบบ numeric; query ส่งคืน aggregate แถวเดียว ไม่โหลดประวัติทั้งบัญชีเข้า Node memory

ตรวจ 10 migrations เดิมกับ checksum ก่อนเริ่มตรงทั้งหมด ไม่มีแก้ migration เก่า; runner ทดสอบ deploy 10 ตัวเดิมในฐานว่างแยก ใส่ timed transaction จำลอง แล้ว deploy ตัวที่11 ยืนยันเวลาเดิมยัง unconfirmed, revision0, pendingfalse และไม่มี evaluation backfill

## Event lifecycle / consistency

- POST/PUT Transaction บันทึก revision/pending พร้อม CRUD ภายใต้ user FOR UPDATE protocol ของ Goals ตรวจ authVersion/ownership หลัง lock; เพิ่ม revision เมื่อค่าที่บันทึกเปลี่ยน รวม type/category/amount/date/time/confirmation/note/description/payment method เพื่อให้คำยืนยันผูกกับ Transaction revision ทั้งรายการ; PUT ค่าเดิมไม่เพิ่ม revision
- หลัง commit เรียก producer; ความล้มเหลวไม่เปลี่ยน CRUD success เป็น failure และ pending ยังอยู่ให้ retry
- เปิด toggle ไม่ backfill; ปิด toggle ล้าง pending ของบัญชีนั้นภายใต้ lock แต่ไม่ลบประวัติ; client Settings เก่าที่ไม่ส่ง notifyAnomaly รักษาค่าเดิม
- Worker/reconcile ใช้ user lock เดียวกัน อ่าน revision ล่าสุดหลัง lock และตรวจ authVersion อีกครั้งก่อน finalize; evaluation+notification+pendingfalse atomic
- eventKey=transaction-anomaly:<transactionId>, unique(userId,eventKey) เดิม + createMany skipDuplicates กันซ้ำตลอดอายุรายการ
- revision ใหม่บันทึก Evaluation ใหม่ได้ แต่ไม่สร้าง notification ซ้ำ ไม่ประเมินรายการอื่นย้อนหลังเมื่อ baseline เปลี่ยน
- DELETE ก่อนตรวจ: pending หายพร้อม Transaction; worker ไม่พบรายการจึง cancelled และไม่สร้าง Evaluation/notification ใหม่ หลังมีผลแล้ว DELETE คง Evaluation/notification เดิม
- รายละเอียดแยก notificationSnapshot ตอนแจ้งที่ไม่แก้ไข กับ latestEvaluation; sourceState/currentRevision/latestAppliesToCurrent ชี้ว่าผลล่าสุดตรงรายการปัจจุบันหรือไม่; ลบต้นทางไม่มีลิงก์แก้ไข

## API contract

- GET /settings: notifications.notifyAnomaly boolean (default false)
- PUT /settings: optional notifyAnomaly boolean, ภายใต้ atomic save/authVersion protocol เดิม
- POST/PUT /transactions: optional transactionTimeConfirmed boolean; true ต้องมีเวลา; client เก่าไม่ส่งแล้วเปลี่ยน date/time จะยกเลิก confirmation; ไม่ส่งและเวลา/วันเดิมรักษาค่าเดิม
- POST /notifications/anomaly/reconcile: body {limit?:1..50(default10),cursor?:UUID}; strict validation ไม่รับ userId/query; response {processed,evaluated,hasMore,nextCursor,asOfDate}. เลือก pending เรียง id, take(limit+1), cursor exclusive. คำขอพร้อมกัน serialize ต่อ user; failure503 rollback batch, retry cursor เดิมได้ งานที่เกิดใหม่ก่อน cursor จะพบในการเริ่มรอบใหม่โดยไม่ส่ง cursor
- GET /transactions/:id/anomaly: เฉพาะ Transaction ที่ยังอยู่และเป็นของ auth user
- GET /notifications/:id/anomaly: เฉพาะ notification ของ auth user รองรับต้นทางถูกลบ
- รายละเอียด: {sourceState,currentRevision,pending,notificationSnapshot,latestEvaluation,latestAppliesToCurrent,transactionLink}; evaluation มีเงินเป็น decimal string และข้อมูล snapshot ณ เวลาตรวจ
- budget reconcile endpoint/contract เดิมไม่เปลี่ยน

## UI

Settings เปิด toggle จริง; Add/Edit ใช้เวลาเริ่มว่าง/checkbox ยืนยันชัดเจน เปลี่ยนวันหรือเวลา reset confirmation; Edit มีรายละเอียดคัดกรองแบบ details/summary

NotificationBell เดิมแสดง snapshot และผลล่าสุดแยกกัน เปิดอ่านจากรายการ anomaly ได้แม้ต้นทางถูกลบ มีปุ่มตรวจ pending แบบแบ่ง batch แยกจากปุ่มตรวจงบ ใช้ keyed session, abort/active/token guard ป้องกัน response ข้ามบัญชี

## ผลตรวจจริง / ข้อจำกัด

รอบสุดท้าย 24 กันยายน 2026: 109 tests ผ่าน 0 fail/skip (anomaly18 + regression91 รวม parent tests), Prisma validate/generate และ backend/frontend build ผ่าน; frontend มี bundle warning >500kB เดิม. Chrome API mocks anomaly7/Settings11/Dashboard8 กลุ่มผ่าน แยกจาก browser acceptance ของผู้ใช้.

- PostgreSQL แยก: migration chain11, legacy timed row, Decimal median/MAD/quartiles, cutoff180วัน/ปีอธิกสุรทิน, ownership, append-only rejection, delete-before-evaluation, latest revision, one lifetime notification, disable/no-backfill, committed concurrent reconcile, simulated producer failure/retry และ authVersion
- HTTP mock Notifications ปรับ fixture ให้มี authVersion และ Prisma.Decimal ตาม schema จริง ไม่ผ่อน validation production
- Chrome API mocks: เวลาเริ่มว่าง, keyboard toggle/save, error/retry, snapshot/latest/deleted source, cursor, mobile/ข้อความยาว และ delayed response หลังสลับ session ผ่าน; Settings/Dashboard browser regression ผ่าน
- Browser acceptance กับ backend จริงยังไม่ผ่านโดยผู้ใช้ในรอบนี้ ต้อง migrate ฐานใช้งานจริงด้วยขั้นตอนที่อนุมัติก่อนเปิดใช้ แล้วตรวจ enable/create/update/delete/history/retry/end-to-end
- ยังไม่มี scheduler/durable queue/event log: durable pending flag รองรับ retry ล่าสุดเท่านั้น; post-commit process หยุดต้องเรียก reconcile/กดตรวจรายการที่ค้าง ไม่รับประกันเวลาส่งแจ้งเตือน
- batch max50 อาจใช้เวลานานเมื่อประวัติหมวดใหญ่มาก; timeout คง pending และ retry batch เล็กลง ไม่มีการปรับ threshold อัตโนมัติ
- หลักฐาน calibration เป็น synthetic scenarios เท่านั้น ดู ANOMALY_CALIBRATION.md ไม่ใช่อัตราความแม่นยำจากผู้ใช้จริง
- ไม่แก้สูตรรายงาน/Goals allocation ไม่เพิ่ม Transaction สมมติ ไม่แตะ local files ที่ค้าง ไม่ใช้ข้อมูลผู้ใช้อื่นเป็น fixture

## ไฟล์งาน

backend/prisma/schema.prisma; migration ใหม่และ .gitattributes; backend/src/lib/anomalyRules.ts, anomaly.ts; backend/src/routes/anomaly.ts, settings.ts; backend/src/index.ts; frontend/src/components/AnomalyDetails.tsx, NotificationBell.tsx; frontend/src/pages/Addtransaction.tsx, EditTransaction.tsx, Settings.tsx; backend/tests/anomaly.test.ts, anomaly.database.test.ts, anomaly.browser.cjs, runAnomalyDatabase.cjs, notifications.http.test.ts, settings.browser.cjs; เอกสารฉบับนี้, ANOMALY_CALIBRATION.md และ SpendSense_PROJECT_CONTEXT.md
## AnomalyReview — 24 กันยายน 2026

เพิ่ม migration แยก 20260924010000_add_anomaly_review เท่านั้น รักษา bytes ของ 20260923010000_add_transaction_anomaly ที่ applied บนฐานทดสอบแล้ว ไม่แก้ migration เดิม และยังไม่ apply anomaly/review บนฐาน application (ยัง10 applied)

### Schema และหลักฐาน

AnomalyReview เก็บ id/userId/evaluationId/originalTransactionId/revision/action/sequence/reviewedAt; action=confirmed_normal หรือ confirmed_problem. ไม่มีแถวแทน unreviewed; คำนวณจากการยังไม่มี review. sequence เป็นลำดับต่อ user/Transaction/revision เพราะ action ยืนยันทั้ง revision แม้มีหลาย evaluation จากต่าง ruleVersion. composite FK(userId,evaluationId,revision) ตรวจ ownership/revision และ trigger ตรวจ originalTransactionId ตรง evaluation

AnomalyReviewRequest เก็บ userId/idempotencyKey/requestFingerprint/reviewId/responseStatus/createdAt แยก เพื่อจดจำคำขอที่เป็น no-op โดยไม่เพิ่ม review ซ้ำ และ replay หลังผู้ใช้เปลี่ยนใจได้. unique(userId,idempotencyKey), FK(userId,reviewId); fingerprint ครอบคลุม evaluationId/action/revision/expectedReviewSequence ไม่เก็บ request body หรือ credential

ทั้งสองตารางมี PostgreSQL BEFORE INSERT/UPDATE/DELETE trigger: UPDATE/DELETE ถูกปฏิเสธ; INSERT lock user และตรวจสถานะบัญชี; review ตรวจลำดับถัดไปและห้าม action เดิมซ้ำ. ไม่มี FK ไป Transaction จึงคงหลักฐานหลังลบได้ แต่มี FK ไป immutable Evaluation. การกดอ่าน Notification ไม่สร้าง Review และ review ไม่แก้ Notification/Evaluation snapshot

### Baseline eligibility ตาม revision ปัจจุบัน

ใช้ SQL function anomaly_amount_exclusion และ lateral joins เลือก evaluation ล่าสุดของ revision ปัจจุบัน/sequence review ล่าสุด โดยมี userId predicate. Query สถิติและ endpoint รายละเอียดใช้ expression เดียวกัน ไม่กรองประวัติทั้งบัญชีใน Node memory

| สภาพ revision ปัจจุบัน | จำนวนเงิน | เวลา |
|---|---|---|
| pending | ไม่ได้ | ไม่ได้ |
| confirmed_problem แม้ระบบไม่ flagged | ไม่ได้ | ไม่ได้ |
| flagged และ unreviewed | ไม่ได้ | ไม่ได้ |
| confirmed_normal | ได้ | ต้องมีเวลาที่ยืนยัน |
| not_flagged | ได้อัตโนมัติ | ต้องมีเวลาที่ยืนยัน |
| not_evaluated เพราะประวัติยังไม่พอ | ได้เพื่อสะสม baseline | ต้องมีเวลาที่ยืนยัน |
| ไม่มี evaluation และไม่ pending (ประวัติเดิม/ปิดตัวตรวจ) | ได้ตามเดิม | ต้องมีเวลาที่ยืนยัน |
| not_evaluated ด้วยเหตุอื่น เช่น amount_zero_iqr_nonconstant | ยังไม่ได้ เว้นแต่ผู้ใช้ยืนยัน normal | ต้องผ่านสิทธิ์จำนวนเงินและมีเวลาที่ยืนยัน |
| ลบแล้ว/เปลี่ยนเป็น income | ไม่ได้ | ไม่ได้ |

ไม่ใช้ lifetime flagged gate. Review ของ revision เก่าไม่มีผลต่อ revision ใหม่; ใหม่ not_flagged กลับเข้า baseline อัตโนมัติ; ใหม่ flagged เริ่ม unreviewed. Technical failure คง pending และไม่มี fake not_evaluated. Time coverage ใช้จำนวนรายการที่เข้า amount baseline เป็นตัวหาร และนับเฉพาะ confirmed time เป็นตัวเศษ

เพิ่ม baselineEligibility=current-revision-review-v1 ใน constants เพื่อ version นโยบายครั้งนี้; ไม่เปลี่ยนค่า window/minima/threshold และการกด review ไม่แก้ constants/ruleVersion. ผลประเมินเก่ายังคง snapshot เดิม; feedback มีผลต่อการตรวจครั้งต่อไป ไม่สร้าง pending/backfill/re-evaluate รายการเก่าโดยอัตโนมัติ

### API

POST /anomaly/evaluations/:id/reviews ต้องมี Idempotency-Key UUID และ body {action,revision,expectedReviewSequence}; reject unknown fields เช่น userId. Auth user lock/authVersion ตรวจหลัง lock ก่อน mutation

- key เดิม/payload เดิมคืน status/body เดิม รวม no-op receipt หลังมี action ใหม่แล้ว
- key เดิม/payload ต่างตอบ409
- action ตรงสถานะล่าสุดคืนแถวเดิม200 ไม่ append; sequence ที่ client ระบุเกินฐานข้อมูลตอบ409
- เปลี่ยน action ต้อง expectedReviewSequence ตรงค่าปัจจุบัน มิฉะนั้น409; concurrent opposite actions มีผู้สำเร็จหนึ่งราย อีกคำขอ409
- append ครั้งใหม่201; reviewedAt จาก server; review revision เก่าหรือหลังลบได้ในเชิงหลักฐาน ไม่เปลี่ยน baseline ของ revision ปัจจุบัน

GET /anomaly/evaluations/:id/reviews?limit=10&cursor=<sequence> (max50) คืน reviewState/reviewSequence/reviewHistory{items,hasMore,nextCursor}; cursor exclusive เรียง sequence DESC. ประวัติเป็นของ revision ที่ evaluation นั้นอ้างถึง

รายละเอียดเดิมคืน currentRevision/latestEvaluation/notificationSnapshot พร้อม reviewState ของ evaluation ที่กำลังดู (หน้า Transaction=latest, Notification=snapshotตอนแจ้ง), reviewHistory หน้าแรก, amountBaselineEligible/amountBaselineReasons/timeBaselineEligible/timeBaselineReasons. เหตุผลมีทั้งกรณีได้และไม่ได้ ไม่บอกว่ารายการอยู่นอก/ใน180วันของเป้าหมายใด เพราะ endpoint นี้บอกสิทธิ์พื้นฐาน; query ตรวจรายการจริงยังกรองวัน/user/categoryตามเดิม

### UI และการตรวจจริง

เพิ่ม AnomalyReviewPanel ภายใน snapshot/ผลล่าสุดของ AnomalyDetails เดิม ไม่สร้างหน้าใหม่; แสดงสถานะและ revision แยกกัน ข้อความ normal=อนุญาตเป็นข้อมูลอ้างอิงตาม field ที่ใช้ได้, problem=กันทั้งสองด้าน, อ่านแจ้งเตือนไม่ใช่ยืนยัน. มีเปลี่ยนใจ/history pagination/error/retry/409/reuse idempotency key หลัง response หาย/keyboard/mobile/session guard และ refresh ทุกแผงหลังบันทึก

- ฐานว่าง: apply12 migrations และ119testsผ่าน (109เดิมปรับตามrevision policy +10 review tests รวม parent)
- ฐานทดสอบเดิม11→12: checksumเดิมตรง ก่อน/หลัง migration ตรวจ fingerprint Transaction/AnomalyEvaluation/Notification/GoalLedgerEntry ไม่เปลี่ยน;28 anomaly/review testsผ่าน
- ทดสอบ PostgreSQL จริง: eligibilityตรงaggregate, Decimal, cold start, pending, read≠review, problem override, reviewเก่า, delete/income, append-onlyทั้ง2ตาราง, ownership/revision, idempotency replay/no-op receipts, concurrent conflict และ authVersion หลังรอ lock จริงจากอีกconnection
- Chrome review API mocks6กลุ่มผ่าน: read/revision scope, keyboard normal/field eligibility, lost response retry/duplicate, เปลี่ยนใจ/pagination, 409 refresh, mobile
- Chrome regression anomaly7/Settings11 ผ่าน; Dashboard8ผ่านเมื่อรันแยกซ้ำ (รอบรวมก่อนหน้ามี failure ที่ month-race timing; ไม่แก้ Dashboard)
- Browser acceptance กับ backend จริงยังไม่ได้ทดสอบโดยผู้ใช้; ฐานapplicationยังไม่พร้อมรันโค้ดใหม่นี้จนกว่าอนุมัติ apply migrations ที่ค้าง

ไฟล์เพิ่มรอบreview: migrationใหม่/.gitattributes, backend/src/lib/anomalyReview.ts, frontend/src/components/AnomalyReviewPanel.tsx, backend/tests/anomalyReview.database.test.ts, anomalyReview.browser.cjs, runAnomalyReviewDatabase.cjs. แก้schema, anomaly.ts/anomalyRules.ts/routes/anomaly.ts/index.ts, AnomalyDetails.tsx, anomaly.database.test.ts, runAnomalyDatabase.cjs และเอกสารที่เกี่ยวข้อง. ไม่มีdependencyใหม่ ไม่แตะlocalเดิม ไม่stage/commit/push
ผลรอบสุดท้ายหลังเพิ่มเหตุผล eligibility: 119testsผ่าน0fail/skip, Prisma validate/generate และ backend/frontend buildผ่าน; frontendยังมีbundle warning >500kB. ตรวจread-only application10/retained test12 และapplied checksumตรงทุกไฟล์ Indexว่าง ไม่stage/commit/push

## Migration และ browser verification — 25 กันยายน 2026 (Asia/Bangkok)

สถานะล่าสุดแทนข้อความก่อนหน้าที่ระบุว่า application ยังมี 10 migrations: deploy สอง migration anomaly/review ที่ได้รับอนุมัติแล้วด้วย prisma migrate deploy; application มี 12 migrations up to date และ checksum ตรงทั้งหมด ไม่แก้ applied SQL ไม่ reset/db push/resolve สำรอง pg_dump แบบ custom นอก Git ก่อน deploy และตรวจ archive อ่านได้ Fingerprint จำนวน/ผลรวม/แถวเดิมของ Transaction, Budget, Goals และ Notification ก่อน/หลังตรงกัน Transaction เดิมมี transactionTimeConfirmed=false ตรวจ append-only trigger definitions ของ Evaluation/Review/receipt ตรงกับฐานทดสอบที่ทดสอบ UPDATE/DELETE rejection แล้ว (ไม่ทดลอง mutation บน application) /health และ /health/db ตอบ 200

Dashboard failure เป็น test harness race: URL เริ่มต้นไม่มี month ทำให้ null !== currentMonth ผ่านก่อน React navigation เสร็จ ปุ่มเดือนถัดไปยัง disabled จึงไม่เกิด request กลับเดือนปัจจุบัน แก้การรอเป็น URL/input/button/request/DOM ที่ตรงกัน ใช้ deferred response gates ตรวจ abort และปล่อย stale response หลังผลปัจจุบันแสดงแล้ว ผ่าน 10/10 รอบ ไม่เพิ่ม random sleep หรือลด assertion ไม่พบ product race และไม่ได้แก้ Overview product code Dashboard, Anomaly และ Review browser suites รันร่วมชุดจาก candidate แล้วผ่านทั้งหมด

Candidate แยกสร้างจาก HEAD และ allowlist ของงาน ไม่รวม local App.css/root package/docker/environment changes npm ci, Prisma validate/generate และ backend/frontend build ผ่าน ระหว่างเตรียม candidate พบ git archive แปลง SQL เก่าบางไฟล์เป็น CRLF จึงคืนเฉพาะสำเนา candidate จาก raw Git blobs และตรวจ bytes ตรง workspace/ฐานข้อมูลก่อน deploy ไม่แตะ migration ต้นฉบับ ผล automated PostgreSQL/regression เดิม 119 tests ผ่าน; รอบนี้เพิ่ม real HTTP/Chrome acceptance บนฐาน acceptance แยกและบัญชีสังเคราะห์ ไม่มี fixture ใน application

AI browser acceptance ผ่าน: เปิด/ปิด setting และ refresh, ประวัติไม่พอไม่แจ้ง, flagged แจ้งครั้งเดียว, read ไม่เปลี่ยน review, keyboard normal/problem/เปลี่ยนใจและ sequence/history เพิ่ม, amount/time eligibility แยกกัน, snapshot เดิมคงอยู่, revision ใหม่ไม่รับ review เก่า, not_flagged กลับ baseline, flagged ใหม่ unreviewed, ลบต้นทางแล้วยังอ่านหลักฐานได้, network error/retry, mobile และ response จริงที่ถูกหน่วงไม่ทับ session ใหม่ Test ใหม่ไม่มี API mock; ใช้ CDP ควบคุม network delivery เท่านั้น

แยกจาก user browser acceptance: ผู้ใช้ยังไม่ได้ยืนยันการตรวจรับ Anomaly/Review ด้วยตนเอง เปิด acceptance UI ที่ http://127.0.0.1:5175 (backend 4001, ฐานแยก) เพื่อทดสอบต่อได้ บัญชี automation เป็นข้อมูลสังเคราะห์และไม่เผยแพร่ credential

ไฟล์ที่เปลี่ยนเพิ่มในรอบนี้: backend/tests/dashboard.browser.cjs, backend/tests/anomaly.acceptance.browser.cjs, ANOMALY_IMPLEMENTATION.md และ SpendSense_PROJECT_CONTEXT.md หลักฐาน logs อยู่ .git/settings-verification ไม่รวม Git สำรองอยู่ C:/Users/zuxas/AppData/Local/SpendSense/backups/2026-09-24T15-49-09-837Z/before-anomaly-review.dump ไม่ stage/commit/push และรักษา local changes เดิม
## User browser acceptance ผ่าน — 25 กันยายน 2026

ผู้ใช้ยืนยันการตรวจรับ Anomaly/Review ผ่านด้วย backend/PostgreSQL acceptance จริง: amount anomaly แบบ zero-dispersion, time anomaly จากเวลาที่ยืนยัน, NotificationBell ข้อความถูกต้องและไม่แจ้งซ้ำ, readAt ไม่ใช่ review, confirmed_normal/confirmed_problem/เปลี่ยนใจพร้อมประวัติ, revision แยกจาก snapshot เก่า, ลบ Transaction แล้วยังอ่าน snapshot และ ownership แยก baseline ตามบัญชีถูกต้อง

ผลนี้เป็น user browser acceptance แยกจาก automated tests/Chrome automation ที่ AI รายงานก่อนหน้า และแทนสถานะก่อนหน้าที่ยังรอผู้ใช้ตรวจรับ ไม่มีการปรับ threshold หรือ ruleVersion จาก feedback ข้อมูลจำลองและบัญชี acceptance อยู่เฉพาะฐานทดสอบ ไม่รวมใน commit; scripts เตรียม baseline, database dump, logs และ artifacts ไม่รวม Git