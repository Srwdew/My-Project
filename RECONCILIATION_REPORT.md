# Reconciliation: Transaction / Overview / Weekly / Budget

วันที่ตรวจจริง: 16 กันยายน 2026 (Asia/Bangkok)
สถานะ: AI รัน tests และ build ผ่าน; ยังไม่ได้ตรวจรับ UI บนเบราว์เซอร์สำหรับการเปลี่ยนแปลงรอบนี้; ไม่ commit/push

## แหล่งข้อมูลและขอบเขตที่ตรวจ

| หน้า/API | แหล่งข้อมูลและขอบเขต | สูตร/ข้อสังเกต |
|---|---|---|
| GET /transactions / History | Transaction ของ userId ที่ยืนยันตัวตนทั้งหมด เรียง transactionDate, createdAt ล่าสุดก่อน | API ไม่ตัดเหลือ 3 วัน; History กรอง search/category/type/date จากข้อมูลเต็มก่อนแบ่งกลุ่ม และแสดงล่าสุด 3 วันที่มีรายการเมื่อไม่มีตัวกรอง |
| History: หมวดใช้จ่ายสูงสุด | Transaction expense ทั้งหมดของบัญชี แล้วแสดง top 5 | เป็นข้อมูลทุกช่วง ไม่ใช่ยอดเดือนที่เลือก และ top 5 ไม่ใช่ทุกหมวด จึงไม่นำมาเทียบยอดรายเดือนโดยตรง |
| GET /overview | Transaction ของบัญชี ช่วง startDate <= transactionDate <= endDate; ไม่ส่งช่วง = ทุกช่วง | รายรับ/จ่ายรวมเป็นสตางค์; Net Cash Flow = รายรับ - รายจ่าย; Saving Rate = Net / รายรับ × 100; เมื่อรายรับศูนย์ API คืน 0 และ UI แสดง — พร้อมคำอธิบาย |
| GET /overview/weekly | expense ของบัญชี ตั้งแต่ startDate รวม endDate ด้วยขอบปลายแบบวันถัดไป exclusive | Monday–Sunday ตัดขอบตามช่วงที่เลือก รองรับไม่เกิน 366 วัน; ผลรวมทุกสัปดาห์และทุกหมวดเท่ากับรายจ่ายช่วงเดียวกัน |
| GET /budget | expense เดือนที่เลือก [วันที่ 1, วันที่ 1 เดือนถัดไป) แบบ UTC surrogate | totalExpense ทั้งเดือน; งบรวมจาก Budget เท่านั้น ไม่บวก CategoryBudget เพิ่ม |
| GET /budget/categories | หมวด expense ทั้งหมด + CategoryBudget และยอด expense ของบัญชี/เดือน | รวมหมวดที่ไม่มีงบ; remaining ใช้ Decimal; ผลรวม expenseAmount ทุกหมวดตรง Budget.totalExpense |
| Budget.timeline | เดือนอดีตครบเดือน; ปัจจุบันถึงวันนี้ Bangkok; อนาคต elapsedDays=0 | planned = งบ × elapsedDays / daysInMonth ปัดเป็นสตางค์; deviation = actualToDate - planned; อนาคต deviation=null |
| Overview presets / History labels | วันปัจจุบัน Asia/Bangkok; transactionDate เป็นวันปฏิทินที่แทนด้วย UTC midnight | Overview และ Weekly รับ start/end ชุดเดียวกัน; ป้ายวันนี้/เมื่อวานของ History แก้ให้ใช้วัน Bangkok แล้ว |

การเทียบใช้บัญชีและช่วงเดียวกัน ไม่ส่งตัวกรอง category/type/search ที่ API สรุปไม่รองรับแล้วสมมติว่า API ใช้ตัวกรองนั้น การเปรียบเทียบรายหมวดใช้แถวหมวดจาก response และ Transaction ที่กรอง categoryId เดียวกัน

## สิ่งที่พบและแก้

1. การใช้ float + toFixed(2) ทำให้เปอร์เซ็นต์บางขอบปัดผิด ผลทดสอบก่อนแก้พบ Saving Rate 2.67 แทน 2.68 และ category percentage 97.32 แทน 97.33 แก้เป็น Prisma.Decimal พร้อม ROUND_HALF_UP ใน Saving Rate, expenseCategories.percentage และ Budget.usedPercentage ซึ่งใช้รูปแบบคำนวณเดียวกัน
2. History ใช้ timezone ของเครื่องสำหรับวันนี้/เมื่อวาน ทดลองเวลา 2026-09-16T17:30Z บน timezone UTC แล้ววันที่ 17 ไม่ขึ้นป้ายวันนี้ แก้ใช้ getBangkokTodayKey และ UTC surrogate ในการหาวันก่อนหน้า/แสดงวัน โดยไม่เปลี่ยนการเลือกวันของ DatePicker หรือ layout

ไม่เปลี่ยนสูตรยอดเงินรวม, รูปแบบ API, schema, migration หรือ UI layout เนื่องจากผลเทียบยอดในขอบเขตที่ทดสอบตรงกัน

## วิธีทดสอบจริง

- HTTP ผ่าน Express app/auth/routes จริงบนพอร์ตชั่วคราวใน process ทดสอบ
- เปลี่ยนเฉพาะ Prisma entry points ใน process ทดสอบให้ทุก query ใช้ PostgreSQL transaction เดียวที่ rollback; ไม่ใช่ฐานข้อมูลจำลองและไม่แก้ dev server
- Oracle อ่าน Transaction รายแถวจริงแล้วแปลง decimal string เป็น BigInt สตางค์ รวมยอดอิสระ ไม่ใช้ aggregate/sum ของ API เป็น expected
- ใช้ Decimal คำนวณเปอร์เซ็นต์อ้างอิงและสูตรแผนตามเวลา
- บัญชีเดิม 4 บัญชีตรวจเฉพาะ GET/อ่านข้อมูล ไม่แก้แถวเดิม
- บัญชี/หมวด/ธุรกรรมทดลองสร้างใน transaction แล้ว rollback ทั้งหมด ตรวจ user fixtures หลังจบเหลือศูนย์
- ทดสอบ timezone ของ utility ใน UTC, America/Los_Angeles และ Asia/Bangkok โดยไม่เปลี่ยน timezone ของเครื่องจริง
- กรณี Time-based Budget ใช้ข้อมูลเดือนกุมภาพันธ์ 2024 ซึ่งเป็นอดีต ณ วันรัน แล้วจำลองเฉพาะนาฬิการายงานให้เป็นวันที่ 15/16 เพื่อพิสูจน์ cutoff ไม่ได้เปิดรับธุรกรรมอนาคตใน CRUD

## ผลเทียบข้อมูลบัญชีเดิม

A–D เป็นลำดับบัญชีในการทดสอบ ไม่แสดงชื่อ อีเมล token หรือรหัสบัญชี ตัวเลขเป็น snapshot ณ เวลาทดสอบเดือนกันยายน 2026

| สิ่งที่ตรวจ | ยอดคาดหวังจาก Transaction | ยอดจริงจาก API | ผล |
|---|---:|---:|---|
| บัญชี A: รายรับ / รายจ่าย | 0 / 480 | Overview 0 / 480; Weekly/Budget 480 | ผ่าน |
| บัญชี B: รายรับ / รายจ่าย | 0 / 211 | Overview 0 / 211; Weekly/Budget 211 | ผ่าน |
| บัญชี C: รายรับ / รายจ่าย | 0 / 3,925 | Overview 0 / 3,925; Weekly/Budget 3,925 | ผ่าน |
| บัญชี D: รายรับ / รายจ่าย | 25,000 / 126 | Overview 25,000 / 126; Weekly/Budget 126 | ผ่าน |
| Net Cash Flow ของ A/B/C/D | -480 / -211 / -3,925 / 24,874 | -480 / -211 / -3,925 / 24,874 | ผ่าน |
| ผลรวมทุกหมวดของ A/B/C/D รวมหมวดไม่มีงบ | 480 / 211 / 3,925 / 126 | Overview categories, Weekly categories, Budget categories ตรงทั้งหมด | ผ่าน |

## ผลกรณีขอบและ regression

| สิ่งที่ตรวจ | ยอดคาดหวัง | ยอดจริง | ผล |
|---|---:|---:|---|
| ไม่มีธุรกรรม: รายรับ/รายจ่าย/Net | 0 / 0 / 0 | 0 / 0 / 0 | ผ่าน |
| มีแต่รายรับ: รายรับ/รายจ่าย/Net | 100 / 0 / 100 | 100 / 0 / 100 | ผ่าน |
| มีแต่รายจ่าย 0.07 + 0.01 | 0.08 | Overview/Weekly/Budget/ทุกหมวด 0.08 | ผ่าน |
| รายรับศูนย์: Saving Rate ไม่หารศูนย์ | API 0 (finite) | 0 | ผ่าน |
| ก.พ. 2024: ต้นเดือน/29 ก.พ.; ตัด 31 ม.ค. และ 1 มี.ค. | รายรับ 1,000; รายจ่าย 100 | 1,000 / 100 ทุก API ที่เกี่ยวข้อง | ผ่าน |
| สัปดาห์คร่อมเดือน 30 ม.ค.–6 ก.พ. | 21 | Overview/Weekly 21; ช่วงย่อยสิ้นสุดอาทิตย์/เริ่มจันทร์ | ผ่าน |
| ข้ามปี 31 ธ.ค.–2 ม.ค. | รายรับ 100; รายจ่าย 24 | 100 / 24 | ผ่าน |
| รายรับ 20,000 รายจ่าย 19,465: Saving Rate | 2.68% | 2.68% หลังแก้ (ก่อนแก้ 2.67%) | ผ่าน |
| หมวด 19,465 จากรายจ่าย 20,000 | 97.33% | 97.33% หลังแก้ (ก่อนแก้ 97.32%) | ผ่าน |
| ใช้ 19,465 จากงบ 20,000 | 97.33% | 97.33% | ผ่าน |
| งบรวม 20,000 และงบหมวด 50 | งบรวม 20,000 | 20,000 ไม่ใช่ 20,050 | ผ่าน |
| เพิ่มรายการ expense | 0.07 | 0.07 ทุก API | ผ่าน |
| ย้ายจาก ก.พ. ไป มี.ค. พร้อมแก้ยอดและหมวด | เดือนเดิม 0; เดือนใหม่ 0.01 | 0 / 0.01 และหมวดใหม่ตรง | ผ่าน |
| เปลี่ยน expense เป็น income | รายรับ 10; รายจ่าย 0 | 10 / 0 | ผ่าน |
| ลบรายการทดลอง | 0 | 0 ทุก API | ผ่าน |
| รายการต่างบัญชี 999,999 | ไม่รวมในบัญชีทดสอบอื่น | ไม่รวม; DELETE ต่างบัญชีได้ 404 | ผ่าน |
| Budget เดือนปัจจุบันและถึงวันนี้ | 0.08 / 0.08 | 0.08 / 0.08 | ผ่าน |
| งบเดือนอนาคต ไม่มีธุรกรรมอนาคต | ใช้ 0; deviation null | 0 / null | ผ่าน |
| จำลอง 15 ก.พ.: ทั้งเดือน / ถึงวันนี้ / แผน | 100 / 30 / 1,500 | 100 / 30 / 1,500 | ผ่าน |
| จำลอง Bangkok ขึ้น 16 ก.พ.: ทั้งเดือน / ถึงวันนี้ / แผน | 100 / 60 / 1,600 | 100 / 60 / 1,600 | ผ่าน |
| History ที่ Bangkok 17 ก.ย. 00:30 แม้ browser UTC | วันที่ 17 = วันนี้ | วันนี้ ในทั้ง 3 timezone | ผ่าน |
| presets เปลี่ยนเดือน/ปีและ leap February; custom range 366 วัน | ช่วงตรงวัน Bangkok, ปฏิเสธวันไม่มีจริง/เกินช่วง | ตรงตาม assertion | ผ่าน |

## Tests และ build รอบสุดท้ายที่ AI รัน

จาก backend:

```powershell
node --import tsx --test tests/budgetNotifications.test.ts tests/notifications.http.test.ts tests/reconciliation.database.test.ts tests/reconciliation.frontend.test.ts
npm.cmd run build
```

ผล: 40 tests ผ่าน 0 fail/skip (รวม parent tests): regression แจ้งเตือนเดิม 22 และ reconciliation/วันที่ใหม่ 18; backend build ผ่าน

จาก frontend:

```powershell
npm.cmd run build
```

ผล: TypeScript และ Vite build ผ่าน

## ยังต้องตรวจบนเบราว์เซอร์

- เลือกช่วงเดียวกันใน Overview/Weekly และเดือนตรงกันใน Budget ตรวจตัวเลขหลัง refresh/ย้ายหน้า
- History: ล่าสุด 3 วันที่มีรายการ เทียบกับดูทั้งหมด/ตัวกรอง โดยไม่ตีความ top 5 หมวดทุกช่วงเป็นยอดเดือน
- ตรวจการแสดง Saving Rate 2.68%, สัดส่วนหมวด/ใช้งบ 97.33% และ — เมื่อไม่มีรายรับ
- ตรวจป้ายวันนี้/เมื่อวานบน browser timezone ต่างจากไทย และเปลี่ยนเดือน/ปี
- ทดลองเพิ่ม/แก้/ลบใน UI แล้วตรวจการ refresh ยอด (CRUD ฝั่ง API และยอดฐานข้อมูลทดสอบแล้ว แต่ interaction/UI refresh รอบนี้ยังไม่ automate)

ผล browser acceptance ของระบบแจ้งเตือนรอบก่อน ไม่ใช่ผลตรวจรับ reconciliation รอบนี้

## ไฟล์รอบนี้

- backend/src/index.ts — Decimal rounding 3 จุด
- frontend/src/pages/Transactionhistory.tsx — ใช้ helper ป้ายวัน Bangkok
- frontend/src/utils/transactionStatus.ts — helper ป้ายวันและ today ที่รับเวลาอ้างอิงเพื่อทดสอบ
- backend/tests/reconciliation.database.test.ts — HTTP/PostgreSQL rollback + independent BigInt oracle + บัญชีเดิม read-only
- backend/tests/reconciliation.frontend.test.ts — timezone/presets/date-range regression
- RECONCILIATION_REPORT.md — รายงานนี้
- SpendSense_PROJECT_CONTEXT.md — ผลส่งต่อ

ไฟล์ History และ utility ยังเป็น untracked จากงานเดิมก่อนรอบนี้ มีสำเนาก่อนแก้เฉพาะสองไฟล์เก็บใน .git/reconciliation-baseline เพื่อแยก diff ไม่ stage/commit/push งานเดิมหรือรอบนี้
