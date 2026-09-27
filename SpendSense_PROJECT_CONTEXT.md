# SpendSense — Project Context & Development Handoff

วันที่สรุป: 14 กันยายน 2026
ภาษาในการทำงานกับผู้ใช้: ภาษาไทย
เอกสารนี้ใช้ส่งต่องานไปยังบัญชี AI ใหม่

## 0. คำสั่งสำหรับ AI ที่รับช่วงต่อ

คุณกำลังรับช่วงพัฒนา SpendSense ที่มีโค้ดและฐานข้อมูลทำงานแล้ว
ห้ามเริ่มสร้างโปรเจกต์ใหม่ ห้ามย้อนทำ migration ที่ผ่านแล้ว
ให้อ่านเอกสารนี้ทั้งหมดก่อนเสนอการแก้ไข

เป้าหมายปัจจุบัน:
ทำระบบแจ้งเตือนกลางผ่านกระดิ่ง โดยเริ่มจากแจ้งเตือนงบ
และรองรับโมดูลตรวจรายการผิดปกติที่จะพัฒนาในอนาคต

จุดที่ค้างล่าสุด:
ส่งโค้ดฟอร์มตั้งค่าการแจ้งเตือนงบใน Budget.tsx แล้ว
แต่ยังไม่มีคำยืนยันจากผู้ใช้ว่าได้วางโค้ด Build และทดสอบฟอร์มชุดนี้ผ่าน
ส่วนฐานข้อมูลแจ้งเตือนและ Backend API ผู้ใช้ยืนยันว่าผ่านแล้ว

การเริ่มงาน:
1. สรุปสั้น ๆ ว่าเข้าใจสถานะงาน
2. ตรวจว่า BudgetNotificationSettings อยู่ใน Budget.tsx แล้วหรือยัง
3. ถ้ามี ให้ตรวจการบันทึกและเปิดอ่านค่ากลับ ไม่ส่งโค้ดเดิมซ้ำ
4. ทำตัวตรวจงบเพื่อสร้าง Notification จริง
5. เชื่อมกระดิ่งในส่วนหัวที่ใช้ร่วมกัน
6. ทดสอบการแจ้งเตือนซ้ำ การอ่าน สิทธิ์ผู้ใช้ และลิงก์ไปหน้าต้นทาง

อย่าถือว่า Context นี้คือสำเนาโค้ดทั้งหมด
ไฟล์ในเครื่องผู้ใช้เป็นแหล่งอ้างอิงโค้ดล่าสุด
หากยังไม่มีโค้ดในบัญชีใหม่ ขอ ZIP ล่าสุดครั้งเดียว
ไม่ขอไฟล์ที่มีอยู่แล้วซ้ำในทุกขั้นตอน

ห้ามอ้างว่าทดสอบผ่านเอง หากมีเพียงคำยืนยันผู้ใช้
ให้แยก “ผู้ใช้ทดสอบผ่าน” ออกจาก “AI รันทดสอบผ่าน”

---

## 1. โปรเจกต์คืออะไร

ชื่อ: SpendSense

เว็บแอปจัดการการเงินส่วนบุคคล สำหรับ:
- บันทึกรายรับและรายจ่าย
- ดูประวัติและค้นหาธุรกรรม
- สรุปภาพรวมทางการเงิน
- ดูรายจ่ายรายสัปดาห์และรายหมวด
- ตั้งงบรายเดือนและงบรายหมวด
- ติดตามยอดใช้จริงเทียบงบ
- ตั้งเป้าหมายการออมในโมดูล Goals ที่ยังต้องพัฒนาต่อ
- วิเคราะห์พฤติกรรมการใช้จ่ายในอนาคต
- ตรวจรายการที่แตกต่างจากรูปแบบปกติในอนาคต
- พยากรณ์ทางการเงินในอนาคต
- แจ้งเตือนเหตุการณ์ที่เกี่ยวข้องผ่านกระดิ่งกลาง

งานมีทั้งส่วนโปรแกรมและเอกสารเชิงวิชาการ
ผู้ใช้เคยต้องการทฤษฎี สมการ และแหล่งอ้างอิงของ:
Total Income, Total Expense, Net Cash Flow, Saving Rate,
Weekly Expense Sum, Weekly Category Expense,
Time-based Budget และ Budget Deviation

ห้ามแต่งแหล่งอ้างอิงหรือถือว่าชื่อสูตรเพียงอย่างเดียวเป็นหลักฐานทางวิชาการ

---

## 2. วิธีทำงานที่ผู้ใช้ต้องการ

ผู้ใช้แก้โค้ดเองใน VS Code และรันคำสั่งเอง

รูปแบบคำตอบที่ต้องใช้:
1. เปิดไฟล์ไหน
2. กด Ctrl+F ค้นหาข้อความอะไร
3. เพิ่มเหนือ/ใต้บรรทัดใด หรือแทนที่บล็อกไหน
4. ให้โค้ดที่ก๊อปวางได้
5. บันทึกและรันคำสั่งจากโฟลเดอร์ไหน
6. บอกผลที่ควรได้และวิธีตรวจ

หากแทนที่ทั้งไฟล์ ต้องระบุชัดว่า Ctrl+A แล้วแทนที่ทั้งหมด
หากเป็น component ใหม่ ต้องระบุว่าอยู่นอก component เดิม
หากเป็น Hook ต้องอยู่ภายใน function component หรือ custom hook เท่านั้น

ผู้ใช้ไม่ชอบ:
- ขอส่งไฟล์เดิมทุกรอบ
- วนทำขั้นตอนที่ผ่านแล้ว
- อธิบายกว้าง ๆ โดยไม่บอกตำแหน่งแก้
- เพิ่มระบบใหญ่โดยไม่กำหนดขอบเขต
- บอกว่าเสร็จทั้งที่มีเพียง UI หรือข้อมูลจำลอง
- เปลี่ยนหน้าตาห่างจาก mockup ที่ให้ไว้

เมื่อผู้ใช้บอก “ผ่าน”, “ไม่มี error”, “ต่อไป”, “lets cook”:
ให้เดินงานถัดไปตามสถานะล่าสุด
ไม่ต้องถามยืนยันว่าจะทำต่อหรือไม่

ถ้าข้อมูลสำคัญขาดจริง ขอเฉพาะส่วนที่จำเป็นและอธิบายเหตุผล
อย่าคาดเดาโค้ดส่วนที่ไม่เคยเห็น

---

## 3. สภาพแวดล้อมและเทคโนโลยี

Frontend:
- React
- TypeScript
- Vite
- React Router
- CSS แยกไฟล์ตามหน้า
- React DatePicker ในหน้าธุรกรรม

Backend:
- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- bcrypt
- jsonwebtoken
- dotenv
- cors

ฐานข้อมูลบนเครื่องผู้ใช้:
- รันผ่าน Docker
- ชื่อคอนเทนเนอร์: SpendSense-db
- ชื่อฐานข้อมูล: SpendSense
- schema: public
- พอร์ตที่เครื่องผู้ใช้: localhost:5433
- PostgreSQL ภายในคอนเทนเนอร์ใช้พอร์ต 5432
- ชื่อ role ไม่ใช่ postgres
- ชื่อ role จริงไม่ได้ถูกบันทึกในบทสนทนา

อ่านชื่อ role ที่ตั้งไว้:
docker exec SpendSense-db printenv POSTGRES_USER

เชื่อมต่อ:
docker exec -it SpendSense-db psql -U <ชื่อ role จริง> -d SpendSense

อย่าสับสน:
SpendSense = ชื่อฐานข้อมูล
SpendSense-db = ชื่อคอนเทนเนอร์

เครื่องผู้ใช้:
- Windows
- VS Code
- Terminal มักเป็น PowerShell

Prisma:
- CLI/Client ที่ผู้ใช้รายงาน: 7.9.1
- มี prisma.config.ts
- Schema อยู่ backend/prisma/schema.prisma
- Client ใช้ generator provider = "prisma-client-js"
- Backend import prisma จาก ./lib/prisma
- อย่าสร้าง PrismaClient ใหม่โดยเดาการตั้งค่า adapter
- ตรวจ src/lib/prisma.ts จริงก่อนเปลี่ยนการเชื่อมต่อ

TypeScript ใช้การตรวจเข้มงวด:
- strict
- exactOptionalPropertyTypes
- noUncheckedIndexedAccess

Backend tsconfig จำกัด:
- rootDir: ./src
- outDir: ./dist
- include: src/**/*.ts
- exclude: node_modules, dist
เพื่อไม่ให้ prisma.config.ts และ prisma/seed.ts หลุดเข้า rootDir ของ build

คำสั่งประจำ:
ใน backend:
npm run build
npx tsc --noEmit --pretty false
npx prisma validate
npx prisma generate
npx prisma migrate status

ใน frontend:
npm run build

คำสั่งเปิด dev server ให้ดู package.json จริง
อย่าเดาชื่อ script หากยังไม่เห็น

---

## 4. แผนผังไฟล์สำคัญ

backend/
  package.json
  tsconfig.json
  prisma.config.ts
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    index.ts
    lib/
      prisma.ts
    middleware/
      auth.ts

frontend/
  src/
    App.tsx
    api.ts
    auth.ts
    components/
      UserHeader.tsx
      Sidebar.tsx
      ส่วน layout และ context ตามโค้ดจริง
    pages/
      Login.tsx
      Register.tsx
      Addtransaction.tsx
      Addtransaction.css
      EditTransaction.tsx
      Transactionhistory.tsx
      Overview.tsx
      WeeklyExpenses.tsx
      Budget.tsx
      Budget.css
    utils/
      transactionStatus.ts
      overviewPeriod.ts หรือไฟล์ utility ช่วงเวลาตามตำแหน่งจริง

ข้อควรระวัง:
- ชื่อ Addtransaction.css ต้องตรงตัวพิมพ์กับ import
- frontend/src/auth.ts กับ backend/src/middleware/auth.ts คนละหน้าที่
- ชื่อ transactionStatus.ts อาจยังอยู่จากระบบเดิม
  แต่หลังถอดระบบสถานะออก ไฟล์นี้เหลือ helper วันที่
  อย่าคิดว่ายังมี planned/completed เพียงเพราะชื่อไฟล์

---

## 5. กติกาข้อมูลที่ตกลงแล้ว

### 5.1 Transaction คือรายการที่เกิดขึ้นจริง

ข้อกำหนดล่าสุดจากผู้ใช้:
- เพิ่มธุรกรรมแล้วนับเป็นรายรับ/รายจ่ายจริงในช่วงวันที่ของรายการทันที
- บันทึกวันนี้ได้
- บันทึกย้อนหลังได้
- ไม่รับวันที่อนาคต
- ไม่ใช้ระบบ planned/completed
- ไม่ต้องมีปุ่มยืนยันรายการล่วงหน้า
- ไม่กลับไปเพิ่มระบบนี้อีกโดยอัตโนมัติ

ผู้ใช้ปฏิเสธระบบบันทึกอนาคตหลังทดลองเพิ่มไปแล้ว
จึงได้ถอด status ออกจาก Transaction และ UI แล้ว

วันที่อนาคตพิจารณาจากวันปัจจุบันของ Asia/Bangkok
ไม่ใช่ timezone ของเซิร์ฟเวอร์
ข้อห้ามปัจจุบันเป็นระดับวันที่ ไม่ใช่ห้ามเวลาอนาคตภายในวันนี้

### 5.2 ความหมายทางการเงิน

- Profile.income = รายได้ที่ผู้ใช้ระบุสำหรับวางแผน
- รายรับจริง = Transaction ประเภท income
- รายจ่ายจริง = Transaction ประเภท expense
- Net Cash Flow = รายรับรวม − รายจ่ายรวมในช่วงเดียวกัน
- Net Cash Flow ไม่ใช่ยอดเงินคงเหลือทั้งหมดในชีวิตผู้ใช้
- Budget เป็นแผน ไม่สร้าง Transaction
- งบรายหมวดไม่บวกเพิ่มเข้าไปในงบรวม
- หมวดที่ยังไม่ตั้งงบยังมีรายจ่ายจริงได้
- ไม่มีข้อมูล ไม่ได้แปลว่าไม่มีการใช้จ่าย
- Goals ไม่ควรสร้างรายจ่ายบริโภคเพื่อแทนการออม
- เงินออมตั้งต้นต้องมีที่มา ไม่สร้างรายรับสมมติให้ยอดตรง
- OCR ยังไม่สร้างรายการจนผู้ใช้ตรวจและยืนยัน

---

## 6. วัน เวลา และจำนวนเงิน

Transaction schema:
- amount Decimal @db.Decimal(12, 2)
- transactionDate DateTime @db.Date
- transactionTime DateTime? @db.Time(0)

transactionDate และ transactionTime เป็นวัน/เวลาที่ผู้ใช้กรอก
ไม่ใช่ timestamp เหตุการณ์ที่ต้องเลื่อน timezone ตอนแสดงผล

แนวทางที่แก้แล้ว:
- วันรับเป็น YYYY-MM-DD
- Backend ใช้ UTC surrogate เช่น 2026-09-12T00:00:00.000Z
- เวลาใช้ฐาน 1970-01-01 และ HH:mm:00.000Z
- Frontend แสดงเวลาโดยอ่าน UTC hours/minutes ตาม convention นี้
- หน้าแก้ไขอ่านวันที่จากส่วน YYYY-MM-DD แล้วประกอบวันที่ท้องถิ่นสำหรับ DatePicker
- ห้ามใช้ toISOString() ของวันที่ท้องถิ่นโดยไม่คิด timezone จนวันเลื่อน
- เก็บ convention นี้ให้เหมือนกันระหว่าง Add/Edit/History/Reports

Validation เงิน:
- รับ string หรือ number
- รูปแบบจำนวนเต็มไม่เกิน 10 หลัก ทศนิยมไม่เกิน 2
- ต้องมากกว่า 0
- ไม่เกิน 9,999,999,999.99
- ปฏิเสธ NaN, Infinity, ค่าที่ไม่ใช่ตัวเลข, ทศนิยมเกิน
- ส่ง string จำนวนเงินเข้า Prisma Decimal
- การรวม/ลบใช้ Decimal หรือจำนวนเต็มสตางค์
- อย่ารวมเงินด้วย float ไปเรื่อย ๆ โดยไม่ควบคุมความคลาดเคลื่อน

Validation วัน:
- YYYY-MM-DD
- ตรวจว่าเป็นวันจริง ไม่ยอมให้ Date rollover
- ไม่รับปี 0000
- ไม่รับวันหลัง Bangkok today
- POST และ PUT ต้องใช้กติกาเดียวกัน

---

## 7. ระบบที่ทำไปแล้วและสถานะหลัก

### Authentication / Profile
มี:
- Register/Login
- bcrypt
- JWT
- middleware ตรวจ token และ payload
- ตรวจผู้ใช้ที่ยังใช้งานได้ด้วย deletedAt: null
- GET /profile
- PUT /profile
- displayName
- ส่วนหัวใช้ชื่อจาก Profile
- หน้าตั้งค่าตามโค้ดจริง

บทเรียน:
- jwt.verify ต้องอยู่ภายใน try/catch
- ตรวจ token และ JWT_SECRET ก่อนเรียก
- อย่าเรียก verify ซ้ำ
- ตรวจ userId/email runtime ไม่ใช่ cast อย่างเดียว
- Express params อาจเป็น string | string[] | undefined
  ต้อง narrow ด้วย typeof === 'string'
- ห้ามลด strict TypeScript เพื่อกลบ error

Frontend API:
- apiFetch ใน src/api.ts
- API_URL จาก VITE_API_URL มี fallback localhost:4000
- ใช้ token localStorage key: spendsense_token
- Login/Register ต้องไม่แนบ auth แบบ protected request
- จัดการ 401 โดยระวัง response เก่าล้าง token ของ session ใหม่

### Transaction
มี CRUD และตรวจเจ้าของ
มี categoryId/type/amount/date/time/paymentMethod/description/note
ผู้ใช้ยืนยันแก้ปัญหาเวลาแสดงไม่ตรงแล้ว
ผู้ใช้ยืนยันถอดสถานะธุรกรรมและ Build ผ่านแล้ว

### History
แสดงล่าสุด 3 “วันที่มีรายการ” ไม่ใช่ 3 วันปฏิทินล่าสุด
มีปุ่มดูทั้งหมด
เมื่อใช้ตัวกรอง ค้นข้อมูลทั้งหมดที่โหลดมา
ตัวกรองไม่ควรถูกจำกัดอยู่เฉพาะ 3 กลุ่มวันที่
สรุปหมวดรายจ่ายเดิมเป็นข้อมูลทุกช่วง จึงห้ามติดป้ายว่าเดือนนี้โดยสูตรไม่ตรง

### OCR / สลิป
มีเพียงเลือกไฟล์และ preview ตามงานเดิม
ยังไม่มี OCR จริงและไม่ถือว่ามีระบบจัดเก็บสลิปสมบูรณ์
นำข้อความสแกนสำเร็จและร้านค้าตัวอย่างออกแล้วตามแนวทางแก้

### Overview
มี KPI และช่วงเวลา 6 แบบตาม utility จริง
ใช้ Transaction เป็นต้นทาง
มีการป้องกัน response เก่าทับช่วงเวลาปัจจุบัน
Saving Rate เมื่อรายรับเป็นศูนย์ไม่ควรแสดงเปอร์เซ็นต์ที่ไม่มีความหมาย

### Weekly
สรุปรายจ่ายรายสัปดาห์และรายหมวด
ช่วงวันต้องตรงกับ Overview เมื่อเลือกช่วงเดียวกัน
กลุ่มสัปดาห์ Monday–Sunday ถูกตัดตามขอบช่วงที่เลือก
ใช้ขอบปลายช่วงแบบ exclusive ในการ query ตาม implementation จริง

### Budget
ผู้ใช้ยืนยันใช้งานจริงและตรวจยอด/ปุ่มผ่านแล้ว
รายละเอียดในหัวข้อถัดไป

### Goals / Analysis / Forecast / Admin
ยังไม่ถือว่าพัฒนาเสร็จ
การมี mockup, route placeholder หรือชื่อ component ไม่ใช่หลักฐานว่าใช้งานได้

---

## 8. Database models

อ้างอิง schema จริงก่อนแก้
รายการนี้สรุปโครงสร้างที่ตกลง ไม่ใช่คำสั่งให้แทนที่ schema ทั้งไฟล์

User:
- id, email unique, passwordHash, createdAt, deletedAt
- profile
- transactions
- budgets
- categoryBudgets
- notifications
- budgetNotificationSetting

Profile:
- id
- userId unique
- displayName String? @db.VarChar(80)
- occupation
- income
- goal
- lifestyle

Category:
- id
- name
- type TransactionType
- createdAt
- transactions
- categoryBudgets
- unique [name, type]

Transaction:
- id
- userId
- categoryId
- type: income | expense
- amount Decimal(12,2)
- transactionDate @db.Date
- transactionTime nullable @db.Time(0)
- paymentMethod nullable
- description nullable
- note nullable
- createdAt
- updatedAt
- indexes userId/categoryId/transactionDate
- ไม่มี status แล้ว

Budget:
- id, userId, year, month, amount Decimal(12,2)
- createdAt, updatedAt
- unique [userId, year, month]

CategoryBudget:
- id, userId, categoryId, year, month
- amount Decimal(12,2)
- createdAt, updatedAt
- unique [userId, year, month, categoryId]
- index categoryId
- user relation onDelete Cascade
- category relation onDelete Restrict

NotificationType:
- budget_near_limit
- budget_exceeded
- transaction_anomaly

Notification:
- id String UUID
- userId String
- type NotificationType
- title String @db.VarChar(160)
- message String @db.VarChar(1000)
- link String? @db.VarChar(500)
- sourceId String? @db.VarChar(160)
- eventKey String @db.VarChar(200)
- readAt DateTime?
- createdAt DateTime default now
- user relation onDelete Cascade
- unique [userId, eventKey]
- index [userId, createdAt]
- index [userId, readAt]

BudgetNotificationSetting:
- id UUID
- userId unique
- enabled Boolean default false
- warningPercent Int default 80
- notifyExceeded Boolean default true
- totalBudget Boolean default true
- categoryBudgets Boolean default true
- createdAt
- updatedAt
- user relation onDelete Cascade

สำคัญ:
Prisma @relation ให้เขียนในบรรทัดเดียว
เคยเกิด P1012 จากตัวอย่างแยกบรรทัดและ onDelete ขาด colon
ตัวอย่าง:
user User @relation(fields: [userId], references: [id], onDelete: Cascade)

---

## 9. Budget — พฤติกรรมและ API ที่มีแล้ว

### งบรวม

GET /budget?year=2026&month=9

ข้อมูลที่หน้าเว็บใช้:
- year
- month
- budgetAmount nullable
- totalExpense
- remaining nullable
- usedPercentage nullable
- status ตาม backend เดิม
- timeline

PUT /budget
Body:
{
  "year": 2026,
  "month": 9,
  "amount": "40000.00"
}

year เป็น ค.ศ.
month 1–12
ช่วงปี validation เดิม 1900–9999
งบต้องมากกว่า 0

### งบรายหมวด

GET /budget/categories?year=2026&month=9

Response:
{
  "year": 2026,
  "month": 9,
  "items": [
    {
      "categoryId": "...",
      "categoryName": "...",
      "budgetAmount": 3000,
      "expenseAmount": 1200,
      "remainingAmount": 1800,
      "status": "within_budget"
    }
  ]
}

status:
- not_set
- within_budget
- at_budget
- over_budget

API คืนหมวด expense ทั้งหมด รวมหมวดที่ยังไม่ตั้งงบ
งบที่ยังไม่ตั้ง = null ไม่ใช่ 0
ยอดใช้รวม Transaction ของ user/หมวด/เดือนนั้น
remaining ใช้ Decimal ลบก่อนแปลงเป็น number

PUT /budget/categories/:categoryId
Body:
{
  "year": 2026,
  "month": 9,
  "amount": "3000"
}

upsert ตาม userId_year_month_categoryId
รับเฉพาะหมวด expense ที่มีจริง

DELETE /budget/categories/:categoryId?year=2026&month=9
ลบเฉพาะงบของ user/หมวด/เดือน
ไม่ลบ Transaction
ไม่มีข้อบังคับว่ารวมงบรายหมวดต้องไม่เกินงบรวมใน implementation ปัจจุบัน
อย่าเพิ่มข้อบังคับนี้เงียบ ๆ

### Time-based Budget

plannedExpenseToDate = งบรวม × elapsedDays / daysInMonth
actualExpenseToDate = รายจ่ายจริงในช่วงที่นับ
deviation = actualExpenseToDate − plannedExpenseToDate

plannedExpenseToDate เป็น “แผนเฉลี่ยตามเวลา”
ไม่ใช่ planned transaction ห้ามลบเพราะชื่อมี planned

เดือนปัจจุบันนับรวมวันนี้ตาม Bangkok
เดือนอดีตนับครบเดือน
เดือนอนาคตยังไม่เริ่มประเมิน
ยังตั้งงบสำหรับอนาคตได้ แม้ห้ามสร้าง Transaction วันที่อนาคต

---

## 10. Budget — mockup และ UI ล่าสุด

ภาพต้นแบบชื่อ Budget(1).png
ต้องใช้ภาพล่าสุดของผู้ใช้เป็นอ้างอิง
กรอบแดงในภาพเป็นกรอบกำกับ ไม่ใช่ขอบ UI ที่ต้องวาดจริง

โครง:
1. Header:
   “การจัดการงบประมาณ”
   “จัดการและติดตามงบประมาณของคุณ”
   UserHeader ด้านขวา

2. Toolbar:
   ช่องเดือนภาษาไทยและปี พ.ศ. พร้อม calendar icon
   ปุ่มตั้งค่าการแจ้งเตือนงบ
   ปุ่มสีน้ำเงิน “+ สร้างงบประมาณ”

3. KPI 4 ช่อง:
   งบประมาณรวม
   ใช้ไป
   คงเหลือ หรือเกินงบรวม
   เกินงบรายหมวด

4. ตาราง:
   หมวดหมู่ + ไอคอน + progress
   งบประมาณ
   ใช้ไป + เปอร์เซ็นต์
   คงเหลือ
   สถานะ
   ดินสอ + เมนู ⋮

5. ส่วนใช้จ่ายเทียบแผนตามเวลาอยู่ใต้ตาราง

หน้าต่าง native <dialog> สำหรับสร้าง/แก้งบ:
- เลือกงบรวมหรือหมวด
- กรอกจำนวนเงิน
- เลือกเดือนจากหน้าหลัก
- disable การเปลี่ยนเดือนระหว่างเปิดหน้าต่าง/บันทึก
- error/success/loading
- ยกเลิกงบรายหมวดผ่านเมนู ⋮

สถานะ UI:
- ยังไม่ตั้งงบ
- ปกติ: ใช้ต่ำกว่า 80%
- ใกล้เกินงบ: ตั้งแต่ 80% แต่ต่ำกว่า 100%
- ใช้ครบงบ: เท่ากับ 100%
- เกินงบ: มากกว่า 100%

ตัวเลขใน mockup มีบางจุดผิด ห้ามทำสูตรผิดตามภาพ:
- 30,170 / 40,000 = 75.425%
- 9,830 / 40,000 = 24.575% ไม่ใช่ 33%
- งบรวมยังเหลือได้ แม้บางหมวดเกินงบ
- “เกินงบรายหมวด” = ผลรวม max(รายจ่ายหมวด − งบหมวด, 0)
- progress ต้องตรงเปอร์เซ็นต์จริงและจำกัดความยาวแถบที่ 100%

ไอคอน:
ปรับจาก emoji มาใช้ BudgetIcon SVG
categoryAppearance เลือกชื่อ icon/color/background จากชื่อหมวด
รองรับ food/car/shopping/game/heart/study/more/calendar/bell/edit/chevron

CSS:
ใช้ Budget.css
มีการเพิ่ม override ต่อท้ายจากรอบปรับ mockup
ตรวจ cascade ก่อนเพิ่ม CSS ซ้ำ
บน desktop 4 KPI, จอเล็ก 2 คอลัมน์
ตารางเลื่อนแนวนอนได้เมื่อพื้นที่ไม่พอ

ข้อจำกัดที่ควรตรวจ:
- UserHeader ตัวจริงยังต้องอ่านก่อนเชื่อมกระดิ่ง
- หน้า Budget รุ่นที่ส่งยังไม่ได้อ่าน query month จาก notification link
- สีใกล้เกินงบในตารางยังเป็น 80% คงที่
  การตั้งค่า notification warningPercent ยังไม่ได้เชื่อมสีตาราง
  อย่าอ้างว่าปรับเปอร์เซ็นต์แจ้งเตือนแล้วสีตารางเปลี่ยนด้วย

---

## 11. Notifications — สิ่งที่ตกลงแล้ว

กระดิ่งเป็นศูนย์รวมแจ้งเตือนทั้งระบบ
ไม่ใช่กระดิ่งเฉพาะ Budget

ประเภทเริ่มต้น:
- ใกล้เต็มงบ
- เกินงบ
- รายการผิดปกติจากโมดูล anomaly ในอนาคต

ผู้ใช้ต้องการ:
- กระดิ่งในส่วนหัว
- จำนวนที่ยังไม่อ่าน
- รายการแจ้งเตือนล่าสุด
- กดเพื่อไปหน้าต้นทาง
- อ่านทั้งหมด
- โหลดหน้าใหม่ไม่สร้างข้อความเดิมซ้ำ
- ตั้งค่าแจ้งเตือนงบแยกผ่านปุ่มในหน้า Budget
- ไม่ใช้ข้อความ anomaly จำลองแทนผลวิเคราะห์จริง

สิ่งที่เสร็จและผู้ใช้ยืนยัน “ผ่าน”:
1. Schema Notification/NotificationType/BudgetNotificationSetting
2. migration เพิ่ม notifications
3. Backend API 5 endpoints ด้านล่าง

สิ่งที่เพิ่งส่งโค้ดแต่ยังไม่ยืนยัน:
- BudgetNotificationSettings component
- เชื่อมปุ่มตั้งค่าใน Budget.tsx
- บันทึกและอ่านค่า API ผ่านฟอร์ม

สิ่งที่ยังไม่ได้ทำ:
- ตัวตรวจยอดงบเพื่อสร้าง Notification
- จุดเรียกตัวตรวจหลังแก้ข้อมูล
- กระดิ่ง UI กลางที่อ่าน API จริง
- polling/refresh/unread synchronization
- anomaly producer
- ช่องทาง push/email/LINE
- หน้าดูแจ้งเตือนทั้งหมดและ pagination

### Notification API ที่ส่งและผู้ใช้ Build ผ่าน

GET /notifications
- auth required
- ล่าสุด 30 รายการ
- order createdAt desc, id desc
- unreadCount นับทั้งหมด ไม่จำกัด 30
- อ่านรายการและ count ผ่าน prisma.$transaction
- GET นี้ไม่สร้างข้อความ

Response:
{
  "items": [
    {
      "id": "...",
      "type": "budget_near_limit",
      "title": "...",
      "message": "...",
      "link": "/budget",
      "sourceId": "...",
      "readAt": null,
      "createdAt": "..."
    }
  ],
  "unreadCount": 1
}

PATCH /notifications/read-all
- updateMany where userId, readAt:null
- data readAt:new Date()
- response { updatedCount }
- ไม่เปลี่ยนเวลาอ่านเดิมของรายการที่อ่านแล้ว

PATCH /notifications/:id/read
- narrow id เป็น string
- ตรวจ id + userId
- ไม่พบตอบ 404
- update เฉพาะที่ readAt:null
- เก็บเวลาอ่านครั้งแรก

GET /notification-settings/budget
- คืนค่าที่บันทึก
- ถ้าไม่มี row คืน default โดยไม่จำเป็นต้องสร้าง row:
  enabled:false
  warningPercent:80
  notifyExceeded:true
  totalBudget:true
  categoryBudgets:true

PUT /notification-settings/budget
- รับทั้ง 5 ค่า
- boolean ต้องเป็น boolean จริง
- warningPercent จำนวนเต็ม 1–100
- ถ้า enabled ต้องเลือก totalBudget หรือ categoryBudgets อย่างน้อยหนึ่ง
- upsert ตาม userId
- ไม่รับ userId จาก client

### ฟอร์มตั้งค่าล่าสุดที่ส่ง

ใน Budget():
const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);

ปุ่มเปิด:
setNotificationSettingsOpen(true)

ใต้ <div className="budget-page">:
{notificationSettingsOpen && (
  <BudgetNotificationSettings
    onClose={() => setNotificationSettingsOpen(false)}
  />
)}

ท้ายไฟล์ นอก component อื่น:
type BudgetNoticeSettings
function BudgetNotificationSettings({ onClose })

ใช้:
- native dialog.showModal()
- useRef active และ lock
- GET settings ตอนเปิด
- PUT ตอนบันทึก
- success/error/loading/retry
- checkbox enabled/notifyExceeded/totalBudget/categoryBudgets
- warningPercent input
- ใช้ responseError/apiFetch/FormEvent/import เดิม
- ใช้ CSS .budget-dialog เดิม
- บล็อกปิดหน้าต่างขณะบันทึก

ต้องทดสอบ:
เปิด → เปิดแจ้งเตือน → ตั้ง 80 → บันทึก
ปิด/เปิดใหม่/รีเฟรช → ค่าต้องอยู่
ยังไม่ถือว่ามีข้อความแจ้งเตือนเพียงเพราะบันทึก setting สำเร็จ

---

## 12. งานที่ AI ใหม่ต้องทำต่อ

### งานแรก: ตรวจการตั้งค่าที่ค้าง
ไม่ต้องทำ schema/API ซ้ำ
ตรวจ BudgetNotificationSettings มีจริงและ Build ผ่าน
หากผู้ใช้ยังไม่ได้วาง ให้ใช้คำแนะนำ Ctrl+F ตามรูปแบบที่ชอบ

### งานสอง: ตัวสร้างแจ้งเตือนงบ

ก่อนเขียน ให้ระบุพฤติกรรมให้ชัด:
- ตรวจเดือนปัจจุบันอย่างเดียว หรือรวมเดือนที่แก้ธุรกรรมย้อนหลัง
- เมื่อเปิดแจ้งเตือนแล้วมีรายจ่ายเกินเกณฑ์อยู่ก่อน จะเตือนทันทีหรือไม่
- เปลี่ยน threshold/งบแล้วนับเป็นเหตุการณ์ใหม่หรือปรับเหตุการณ์เดิม
- หากเกินงบทันที จะสร้างเฉพาะ exceeded หรือสร้าง near ด้วย
- หากยอดกลับลงมาแล้วเกินใหม่ จะเตือนซ้ำหรือไม่
- แจ้งเตือนเก่าเป็นประวัติ ณ เวลาตรวจ หรือข้อความสถานะปัจจุบัน

ประเด็นเหล่านี้ยังไม่ได้ล็อกทั้งหมดในบทสนทนา
ห้ามอ้างว่าเป็นข้อกำหนดเดิม
เสนอค่าเริ่มต้นที่เรียบง่ายและอธิบายผลให้ผู้ใช้เห็น

ข้อกำหนดทางเทคนิค:
- ไม่สร้าง Notification จาก request body ที่เชื่อใจไม่ได้
- อ่านงบและยอดจริงของ user ฝั่ง server
- เคารพ enabled/ขอบเขต/threshold/notifyExceeded
- ใช้ Decimal/สตางค์
- unique [userId,eventKey] กันซ้ำและรองรับ concurrent requests
- eventKey ต้องระบุ scope/month/type อย่างเหมาะสม
- sourceId เชื่อมไปงบหรือรายการต้นทาง
- link เป็นเส้นทางภายในแอปที่กำหนดฝั่ง server
- คำนึงถึง Notification เก่าเมื่อแก้/ลบ Transaction
- ไม่ทำให้ CRUD สำเร็จแล้วตอบล้มเหลวจนผู้ใช้กดซ้ำเพราะ notification ล้มเหลว
- ถ้าแยกบันทึกกับแจ้งเตือน ต้องมีทาง retry/reconcile
- อย่าเพิ่ม queue ใหญ่โดยไม่จำเป็น

จุดที่ต้องพิจารณาเรียกตรวจ:
- หลังเพิ่ม/แก้/ลบ Transaction
- หลังเปลี่ยนงบรวม
- หลังเปลี่ยน/ยกเลิกงบหมวด
- หลังเปลี่ยน settings
- การแก้วัน/หมวดต้องคำนึงถึงทั้งต้นทางและปลายทาง

### งานสาม: กระดิ่งกลาง

อ่าน UserHeader/AppLayout จริงก่อน
วางในส่วนหัวที่ใช้ร่วมกัน ไม่เพิ่มกระดิ่งซ้ำทุกหน้า

ควรมี:
- ปุ่มกระดิ่ง + badge unread
- loading/empty/error/retry
- รายการล่าสุด 30 รายการตาม API ที่มี
- แยก read/unread
- อ่านทั้งหมด
- กดรายการ mark read แล้วไปหน้าต้นทาง
- refresh เมื่อเปิดกระดิ่ง/หลังการเปลี่ยนข้อมูลตามที่ออกแบบ
- cleanup polling/request เมื่อ logout หรือ unmount
- ป้องกัน response ของบัญชีเก่าทับบัญชีใหม่
- keyboard/escape/focus ที่ใช้งานได้

อย่าเรียก 30 รายการล่าสุดว่า “ทั้งหมด”
ถ้าจะเพิ่มดูทั้งหมดต้องเพิ่ม pagination API จริง

### งานสี่: ทดสอบแจ้งเตือน

- ปิด enabled → ไม่สร้างแจ้งเตือนงบใหม่
- ใต้ threshold → ไม่เตือน
- ถึง threshold → เตือนตามกติกา
- เกินงบ → exceeded ตาม setting
- reload ซ้ำ → ไม่เพิ่มข้อความเดิม
- ข้อมูลคนละบัญชีไม่ปะปน
- อ่านหนึ่งรายการ → count ลดถูกต้อง
- อ่านทั้งหมด → เฉพาะบัญชีตัวเอง
- กดแจ้งเตือนเดือนเก่า → ไปเดือนที่ถูกต้อง
- แก้/ลบธุรกรรม → ปฏิบัติต่อข้อความเก่าตามนโยบายที่ระบุ

---

## 13. Migration history และเหตุการณ์ที่แก้แล้ว

Migration ที่ทราบชื่อ:
1. 20260819035116_init_user_profile
2. 20260907083506_add_categories_transactions
3. 20260907131548_add_payment_method_description
4. 20260909172406_add_profile_display_name
5. 20260910090334_add_monthly_budget
6. 20260912062414_add_transaction_status
7. 20260912100456_remove_transaction_status_and_add_category_budgets
8. migration ลงท้าย add_notifications
   timestamp ไม่ได้บันทึกในบทสนทนา

ปัญหาที่เคยเกิด:
- ผู้ใช้นำ SQL ลบ status ไปแทนใน migration เพิ่ม status เดิม
- shadow database รันไม่ได้: P3006/P3018 column status does not exist
- migrate status เคยบอก up to date แต่เนื้อหา migration ยังผิด
- จึงคืนไฟล์เดิมผ่าน VS Code Timeline
- สร้าง migration ใหม่ remove_transaction_status_and_add_category_budgets

SQL migration ใหม่มี:
BEGIN;
LOCK TABLE "Transaction" IN ACCESS EXCLUSIVE MODE;
ตรวจ planned
ตรวจวันอนาคต Bangkok
DROP COLUMN status
CREATE TABLE CategoryBudget พร้อม indexes/relations
COMMIT;

Guard ตรวจพบข้อมูลทดลอง:
- มี Transaction 17 รายการ
- planned 3
- future 2 (อยู่ใน planned 3 เดียวกัน)

ลบตามคำอนุญาตผู้ใช้เฉพาะ 3 รายการ:
88a54d8e-5017-4c8f-a921-76e713548be7
5440ed19-d4e3-43bf-aaef-34dd1f24f18a
046a434c-dd86-4670-b579-b45b782c55e4

จากนั้น:
npx prisma migrate resolve --rolled-back 20260912100456_remove_transaction_status_and_add_category_budgets
npx prisma migrate dev
npx prisma generate
npm run build

ผู้ใช้ยืนยันไม่มี error แล้ว

ห้ามรันคำสั่งกู้เหล่านี้ซ้ำเพราะเห็นใน Context
เป็นเหตุการณ์ในอดีตที่แก้แล้ว

ผู้ใช้เคยอนุญาตลบข้อมูลจำลอง ณ เวลานั้น
ไม่ควรถือว่าอนุญาตลบฐานข้อมูลในอนาคตโดยไม่ดูบริบทใหม่

Transaction ไม่มี status แล้ว
enum TransactionStatus อาจยังเหลือใน schema/DB:
SQL ใหม่ที่ผู้ใช้ส่งไม่มี DROP TYPE
ให้ตรวจจริงหากต้อง cleanup
อย่าแก้ applied migration เก่าเพื่อลบ enum ย้อนหลัง

หลัก migration:
- ไม่ทับไฟล์ที่ apply แล้ว
- การเปลี่ยนใหม่สร้าง migration ใหม่
- migrate status ไม่พิสูจน์ว่าไม่มี drift หรือ checksum issue ทุกชนิด
- --create-only ยังตรวจ history/shadow และอาจร้องขอ reset
- ไม่ reset หรือ docker compose down -v โดยอัตโนมัติ
- resolve --rolled-back ใช้หลังตรวจการ rollback จริงและแก้สาเหตุแล้ว
- ห้ามแก้ _prisma_migrations ด้วย SQL เพื่อกลบประวัติ

---

## 14. แผนงานหลัง Notifications

ลำดับหลัก:
1. ปิดงานแจ้งเตือนงบ + กระดิ่งกลาง
2. ตรวจยอด Transaction/Overview/Weekly/Budget ช่วงเดียวกัน
3. Goals พร้อมบัญชีการจัดสรรเงินและยอดตั้งต้น
4. Setup/Settings ที่เกี่ยวข้อง
5. Data Readiness และเกณฑ์ประเมินโมดูลวิเคราะห์
6. Behavior Analysis
7. Anomaly Detection เชื่อมกระดิ่ง
8. Forecast พร้อม backtesting
9. Overview รอบสมบูรณ์
10. Admin/งานส่งมอบตามขอบเขตที่ตกลง
11. ตรวจรับและ deploy สภาพแวดล้อมทดสอบ

ไม่จำเป็นต้องย้ายโครงสร้าง Backend ใหญ่ทั้งโปรเจกต์ก่อนทำงาน
สามารถแยก service เมื่อช่วยให้โค้ดใหม่ทดสอบและใช้ซ้ำได้

### Goals

ยังต้องออกแบบ:
- เป้าหมาย
- ยอดเป้าหมาย
- กำหนดเวลา
- เงินตั้งต้น
- รายการจัดสรรเงินเข้า/ออก
- ที่มาของเงิน
- ผลกระทบเมื่อแก้ Transaction ที่อ้างอิง
- ป้องกันเงินถูกนับซ้ำหลายเป้าหมาย

ห้ามตีความรายรับทั้งหมดว่าเงินออม
ห้ามสร้าง Transaction รายรับสมมติให้ยอดออมตรง

### Data Readiness

แยก “แสดงข้อมูล” กับ “วิเคราะห์”
สรุปยอดได้แม้มีข้อมูลน้อย แต่ต้องบอกช่วงและจำนวนข้อมูล
เกณฑ์ 30 วัน/30 รายการไม่ใช่เกณฑ์สากลทุกโมดูล

ผู้ใช้เคยระบุ:
ถ้ามีหมวดที่จำเป็นต่อการวิเคราะห์ไม่พร้อม ไม่ควรวิเคราะห์ต่อแบบฝืนข้อมูล
ต้องนิยามขอบเขตหมวดที่เกี่ยวข้องและนโยบายหยุดให้ชัดก่อนเขียน gate

### Anomaly

ยังไม่มีอัลกอริทึมจริงที่ยืนยันว่าพร้อมใช้
ข้อความควรเป็น “รายการที่ควรตรวจสอบ”
ไม่กล่าวหาว่าฉ้อโกงหรือผิดแน่นอน
ต้องมีเหตุผล/หลักฐานและลิงก์รายการต้นทาง

### Forecast

ต้องมี:
- เกณฑ์ความพร้อมเฉพาะ
- ขอบช่วงอ้างอิง
- ทดสอบย้อนหลัง
- เทียบ baseline
- รายงานความคลาดเคลื่อน
- ไม่แสดงผลที่ไม่มีข้อมูลรองรับเป็นข้อเท็จจริง

---

## 15. ข้อจำกัดและสถานะการตรวจสอบ

งานส่วนใหญ่:
AI ให้โค้ดและขั้นตอน
ผู้ใช้วางในเครื่อง Build และทดสอบเอง

สิ่งที่ยืนยันได้:
- ผู้ใช้แจ้งว่าธุรกรรม/เวลาแก้แล้ว
- ผู้ใช้แจ้งว่า migration ลบ status + เพิ่ม category budgets ผ่าน
- ผู้ใช้แจ้งว่า Budget ใช้งานได้จริง
- ผู้ใช้แจ้งว่า notifications schema และ API Build ผ่าน
- ฟอร์ม settings ล่าสุดยังไม่ยืนยันผล

ไม่ควรอ้าง:
- ผ่าน automated tests ทั้งระบบ
- audit ความปลอดภัยครบ
- production deployment สำเร็จ
- ระบบแจ้งเตือนส่งข้อความจริงแล้ว
- anomaly/forecast/goals เสร็จแล้ว

Context ไม่ได้สำรอง:
- source code ทุกไฟล์
- Database rows
- .env/credentials
- Docker volume
- migration files แบบ byte-for-byte
- mockup ทุกภาพ

ลิงก์ไฟล์หรือ Library ID จากบัญชีเก่าอาจใช้ในบัญชีใหม่ไม่ได้
ดาวน์โหลดไฟล์ที่จำเป็นมาแนบในบัญชีใหม่
ไม่ใส่ secrets/token/password ใน Context

---

## 16. วิธีอัปเดต Context ระหว่างทำงานต่อ

เมื่อจบงานแต่ละชุดให้บันทึก:
- วันที่
- ไฟล์ที่แก้
- API/schema ที่เพิ่มหรือเปลี่ยน
- migration ชื่อจริง
- พฤติกรรมที่ผู้ใช้ตกลง
- ผลทดสอบที่เกิดขึ้นจริงและผู้ทดสอบ
- ข้อจำกัด
- จุดถัดไปที่ค้าง

อย่าทำเครื่องหมาย “เสร็จ” ตั้งแต่แค่ส่งโค้ด
แยก:
- วางแผน
- ส่งโค้ดแล้ว
- Build ผ่าน
- ทดลองใช้งานผ่าน
- ตรวจรับครบ

จุดเริ่มงานครั้งถัดไป:
ตรวจ BudgetNotificationSettings ล่าสุด
แล้วทำ Notification producer และกระดิ่งกลางให้เชื่อมกันจริง

อ่าน SpendSense_PROJECT_CONTEXT.md ทั้งหมด แล้วรับช่วงพัฒนา SpendSense ต่อจากจุดค้าง ไม่เริ่มโปรเจกต์ใหม่ ไม่ทำ migration ที่ผ่านแล้วซ้ำ ใช้รูปแบบระบุไฟล์ → Ctrl+F → จุดเพิ่มหรือแทนที่ → โค้ด → วิธีทดสอบ เริ่มจากตรวจฟอร์มตั้งค่าแจ้งเตือนงบล่าสุด แล้วทำตัวสร้างแจ้งเตือนและกระดิ่งกลางต่อครับ
---

## อัปเดต 16 กันยายน 2026 — Budget notifications

สถานะ: ลงโค้ดและ automated tests ผ่านโดย AI; browser acceptance ระบบแจ้งเตือนงบผ่านตามที่ผู้ใช้ยืนยัน ไม่ได้อ้างว่า AI รัน browser automation

### ไฟล์งานรอบนี้ (13 ไฟล์)

- backend/src/index.ts
- backend/src/lib/budgetNotifications.ts
- backend/tests/budgetNotifications.test.ts
- backend/tests/notifications.http.test.ts
- backend/tests/budgetNotifications.database.ts
- frontend/src/api.ts
- frontend/src/auth.ts
- frontend/src/components/NotificationBell.tsx
- frontend/src/components/UserHeader.tsx
- frontend/src/components/UserHeader.css
- frontend/src/pages/Budget.tsx
- NOTIFICATIONS_IMPLEMENTATION.md
- SpendSense_PROJECT_CONTEXT.md

ไม่ได้แก้ schema หรือ applied migration ในงานรอบนี้ ใช้ settings form/API เดิมต่อ และเพิ่ม POST /notifications/reconcile

### พฤติกรรมที่ตกลงและลงโค้ดแล้ว

- บันทึกเปิดแจ้งเตือนแล้วตรวจเดือนปัจจุบันตาม Asia/Bangkok ทันที
- แก้ธุรกรรมย้อนหลังตรวจเดือนที่ได้รับผลทั้งหมด รวมเดือนเดิมและใหม่เมื่อย้ายวันที่; ตรวจหลังเพิ่ม/แก้/ลบธุรกรรม เปลี่ยนงบรวม/รายหมวด/ยกเลิกงบ และ settings
- อ่านยอด expense จริงฝั่ง server ใช้ Decimal และแยกบัญชี/เดือน/ขอบเขตงบ
- เตือนแต่ละประเภทครั้งเดียวต่อบัญชี/เดือน/ขอบเขต เปลี่ยนงบหรือ threshold ไม่รีเซ็ต eventKey
- ใช้ unique userId/eventKey เดิมร่วมกับ PostgreSQL advisory transaction lock ต่อบัญชีรองรับคำขอพร้อมกัน
- exceeded เมื่อยอดมากกว่างบเท่านั้น; ยอดเท่ากับงบยังไม่ใช่ exceeded
- เกินทันทีและเปิด notifyExceeded สร้างเฉพาะ exceeded; หากปิด ยังสร้าง near เมื่อถึง warningPercent ได้ โดยข้อความแสดงยอดจริงและยอดเกินจริง
- ไม่สร้าง near ภายหลังหากเคย exceeded ในขอบเขตเดือนเดียวกัน
- ข้อความเก่าคงเป็น snapshot ณ เวลาตรวจ ไม่เปลี่ยนตามยอดปัจจุบัน
- producer ล้มเหลวไม่ทำให้ CRUD ที่บันทึกสำเร็จตอบล้มเหลว
- กระดิ่งแสดงล่าสุด 30 รายการ, unread ทั้งหมด, อ่านรายรายการ/ทั้งหมด, retry, polling, session isolation และลิงก์เดือนที่ Budget อ่านจาก query

### หลักฐานการทดสอบ

AI รัน backend/frontend build ผ่าน และ automated tests 22 tests ผ่าน: service และ Express HTTP/auth/validation จริงโดยใช้ Prisma double ครอบคลุม threshold/exceeded/Decimal/Bangkok month boundary/กันซ้ำ/snapshot/ขอบเขต/แยกบัญชี/ย้ายเดือน/CRUD hooks/ไม่รับวันอนาคต/อ่านแจ้งเตือน/reconcile/producer failure ที่ไม่ทำให้ create ตอบล้มเหลว

AI ทดสอบ PostgreSQL จริงแบบ rollback ผ่าน: settings upsert/read, producer, ขอบเขตยอด, deduplication, แยกบัญชี/เวลาอ่านครั้งแรก และสอง transaction สำหรับ advisory lock/unique-index contention ทุกข้อมูลทดสอบ rollback ไม่มีข้อมูลทดสอบค้าง ผลนี้ไม่ใช่การจำลองสองคำขอที่ commit จริงทั้งคู่

ผู้ใช้ยืนยัน browser acceptance ระบบแจ้งเตือนงบผ่านแล้ว แยกจาก automated tests ที่ AI รัน ขณะนี้ไม่มีผลยืนยันแยกเพิ่มเติมสำหรับ concurrent สองคำขอที่ commit จริงทั้งคู่

### ข้อจำกัดและงานถัดไป

ไม่มี durable queue/event log การ reconcile ตรวจงบทุกเดือนที่ยังมีจากยอด ณ เวลาตรวจใหม่ รวมเดือนปัจจุบัน จึงอาจสร้างข้อความเดือนเก่าที่เข้าเกณฑ์และไม่เคยแจ้ง แต่ไม่สามารถ replay เหตุการณ์ที่ยอดข้ามเกณฑ์แล้วถูกแก้กลับระหว่าง outage หรือขอบเขตงบที่ถูกยกเลิกไปแล้ว

งานถัดไป: reconciliation ของตัวเลข Transaction/Overview/Weekly/Budget ให้ตรงกันในบัญชีและช่วงเวลาเดียวกัน ตรวจ convention วันที่และขอบเดือน Asia/Bangkok, การรวมเงิน, หมวดหมู่ และผลเมื่อแก้/ลบรายการ

การจัดเก็บ Git รอบนี้เลือกเฉพาะ 13 ไฟล์ข้างต้น ไม่รวม package/schema/migration/ไฟล์อื่นที่มีการแก้ค้างมาก่อน อย่างไรก็ตามบางไฟล์ที่เลือกยังไม่เคย tracked หรือมีเนื้อหาเดิมค้างอยู่ จึงเป็นการ commit เนื้อหาปัจจุบันทั้งไฟล์ ผล build เป็นของ workspace ปัจจุบัน ซึ่งยังมี dependencies/source ที่ค้างนอก commit

รายละเอียดคำสั่งทดสอบและผลรอบพัฒนาอยู่ NOTIFICATIONS_IMPLEMENTATION.md

---

## อัปเดต 16 กันยายน 2026 — Reconciliation ของ Transaction / Overview / Weekly / Budget

สถานะ: AI ตรวจโค้ดล่าสุดและรันการเทียบยอดผ่าน HTTP กับ PostgreSQL จริงแล้ว; tests และ build ผ่าน ยังไม่ได้ browser acceptance สำหรับงาน reconciliation รอบนี้ และยังไม่ commit/push

แหล่งอ้างอิงเป็น Transaction รายแถวจริง คำนวณอิสระด้วย BigInt สตางค์และ Decimal เทียบภายในบัญชี/ช่วงเดียวกัน ทดสอบข้อมูลเดิม 4 บัญชีแบบอ่านอย่างเดียว (4 account-months: กันยายน 2026) และข้อมูลทดลองใน transaction rollback โดยไม่แก้ข้อมูลเดิม/schema/applied migration ไม่ reset

ผลข้อมูลเดิม: รายจ่าย 480 / 211 / 3,925 / 126 ตรงกันระหว่าง Transaction, Overview, Weekly, Budget และผลรวมทุกหมวดรวมหมวดไม่มีงบ; บัญชีที่ 4 มีรายรับ 25,000 และ Net Cash Flow 24,874 ตรงกัน บัญชีอื่นรายรับ 0 ไม่หารศูนย์ (API savingRate=0, UI เดิมแสดง —)

พบและแก้เฉพาะสาเหตุ:
- float + toFixed ทำ Saving Rate ได้ 2.67 แทน 2.68 และสัดส่วนหมวด 97.32 แทน 97.33 เปลี่ยนการปัด Saving Rate/expenseCategories.percentage/Budget.usedPercentage เป็น Prisma.Decimal ROUND_HALF_UP
- History ใช้วันเครื่องแทน Bangkok ในป้ายวันนี้/เมื่อวาน แก้ใช้ helper Bangkok + UTC surrogate ไม่เปลี่ยน DatePicker หรือ layout

สูตรและขอบช่วงที่ยืนยัน: Transaction API คืนข้อมูลทั้งหมด ไม่ใช่เฉพาะ 3 วันที่มีรายการที่ History แสดง; Overview และ Weekly ใช้ start/end เดียวกัน (รวมปลายวัน), Weekly Monday–Sunday ตัดขอบและไม่เกิน 366 วัน; Budget ใช้ทั้งเดือนและแยก actualExpenseToDate ตาม Bangkok; ไม่บวกงบหมวดเพิ่มในงบรวม; top 5 หมวดของ History เป็นทุกช่วง ไม่ใช้เทียบผลรวมเดือนโดยตรง

ผลที่ AI รันจริง:
- 40 tests ผ่าน (regression แจ้งเตือนเดิม 22 + reconciliation/วันที่ 18; รวม parent tests), ไม่มี fail/skip
- PostgreSQL HTTP ทดสอบไม่มีธุรกรรม/รายรับอย่างเดียว/รายจ่ายอย่างเดียว, 0.07+0.01, ต้น/ปลายเดือน, leap February, ข้ามปี, สัปดาห์คร่อมเดือน, CRUD ย้ายวัน/หมวด/ประเภท/ลบ, แยกบัญชีและปฏิเสธลบข้ามบัญชี
- ทดสอบนาฬิการายงานจำลอง Bangkok เที่ยงคืน: ทั้งเดือน 100 คงเดิม, ถึงวันนี้ 30 -> 60, แผน 1,500 -> 1,600; ใช้ธุรกรรมอดีตที่สร้างใน rollback ไม่เปิดรับธุรกรรมอนาคต
- date utility ผ่าน UTC/America/Los_Angeles/Asia/Bangkok, presets และ validation 366 วัน
- ตรวจว่าบัญชีทดลองหลัง rollback เหลือ 0; backend/frontend build รอบสุดท้ายผ่าน

ไฟล์รอบนี้: backend/src/index.ts; frontend/src/pages/Transactionhistory.tsx; frontend/src/utils/transactionStatus.ts; backend/tests/reconciliation.database.test.ts; backend/tests/reconciliation.frontend.test.ts; RECONCILIATION_REPORT.md; SpendSense_PROJECT_CONTEXT.md

สิ่งที่ยังต้องทำ: browser acceptance ของการแสดงเปอร์เซ็นต์/ป้ายวันและการ refresh ยอดหลัง CRUD/เปลี่ยนช่วงในแต่ละหน้า ผลตรวจรับแจ้งเตือนจากผู้ใช้ในรอบก่อนยังไม่ใช่ผลตรวจรับ reconciliation นี้ ดูตาราง expected/actual และคำสั่งทดสอบใน RECONCILIATION_REPORT.md

ข้อจำกัดระบบแจ้งเตือนเดิมเรื่องไม่มี durable queue/event log ยังคงเดิม ไม่ได้เปลี่ยนในงาน reconciliation นี้ งานเดิมที่ค้างใน Git ถูกคงไว้ และไม่มี commit/push รอบนี้

---

## อัปเดต 17 กันยายน 2026 — Goals implementation

สถานะ: ลง schema/migration, backend/API, Transaction guards และ frontend Goals แล้ว; automated tests/build ผ่าน ยังรอ browser acceptance ของ Goals และยังไม่ stage/commit/push

Repository preflight: HEAD e806b56 เป็นงานแจ้งเตือนที่ commit แล้ว งาน reconciliation และไฟล์เก่าอื่นยังคงอยู่ migration เดิม 8 ชื่อมีไฟล์ครบ checksum SHA-256 ตรงฐานข้อมูลทั้งหมด รวมประวัติ rollback เก่าที่มี apply สำเร็จตามมา ไม่ได้แก้ applied migration หรือ _prisma_migrations เอง

Migration ใหม่ชื่อ 20260916153000_add_goals_ledger ทดสอบทั้งชุดบนฐานข้อมูล PostgreSQL แยกแล้วจึง apply เฉพาะ migration ใหม่นี้กับ SpendSense; migrate status ล่าสุด up to date ตรวจ fingerprint ข้อมูล 8 ตารางเดิมก่อน/หลังตรงกันทั้งหมด ไม่มี backfill หรือข้อมูลทดลองในฐานเดิม

Goals ใช้ append-only Operation/Ledger/OpeningRevision, Decimal money strings, opening source กลางพร้อม cutoff/note/audit, income source จริง, FIFO release, correction แบบชดเชย, idempotency รวม CREATE Goal, user row lock, DB source-ownership trigger และ composite FKs, snapshot คงเดิมเมื่อ source ถูกแก้/ลบหลังคืนครบ ไม่มี Transaction สมมติ ไม่มี Goals notification

สถานะคำนวณ completed/overdue/not_started/active แยก archivedAt; not_started แสดง “ยังไม่มีเงินจัดสรร”; archive-only; progress ตัวเลขเกิน100ได้แต่ barจำกัด100; เดือนนับรวมเดือนปัจจุบันและเดือนเป้าหมาย, requiredMonthly ปัดขึ้นถึงสตางค์; ไม่มีประวัติแผนรายเดือน

Frontend ใช้ mockup docs/mockups/Savings-goals-page.png, UserHeader/NotificationBell เดิม; card/list, create/edit, opening, allocate/release/history/correction, filters/archive/restore, error/retry และ dialog; view preference ต่อ user และ reset state เมื่อเปลี่ยน session; responsive navigation ปรับ Sidebar/AppLayout กลาง

ผลรันจริง: Goals27 tests (รวม parent tests) + notification/reconciliation regression40 =67ผ่าน ไม่มีfail/skip; มี HTTP/PostgreSQL จริงและหลาย connection ที่ commit จริง ทดสอบเงินไม่จัดสรรเกิน/คืนเกิน, concurrent retries, source-edit/archive races, append-onlyปฏิเสธUPDATE/DELETE, sourceownershipระดับDB, ลบTransactionหลังnet0แล้วliveFKเป็นnullแต่owner/originalID/ledger/operationคงเดิม และรายงานเดิมไม่เปลี่ยนหลังallocation Backend/frontend buildผ่าน; frontendมีคำเตือนbundleเกิน500kB

ไฟล์และรายละเอียดหลักฐานอยู่ GOALS_IMPLEMENTATION.md; แบบและข้อจำกัดอยู่ GOALS_DESIGN.md ไฟล์ทดสอบสร้างฐานชื่อ spendsense_goals_test_* แยกและคงไว้ตรวจสอบ ไม่ลบฐานใด ไม่ reset

ข้อจำกัด: ยังไม่มี browser automation/acceptance ของ Goals; filteringถูกต้องก่อนpaginationแต่ยังอ่านGoalsทั้งหมดเพื่อคำนวณก่อนแบ่งหน้า, income picker/historyโหลดทุกหน้า; ไม่มีcash-account ledgerจึงรับรองได้เฉพาะsourcecapacity; notificationเดิมยังไม่มีdurable queue/event log ไม่ได้แก้ในรอบนี้

งานถัดไป: ผู้ใช้ตรวจ Goals บนเบราว์เซอร์ตาม checklist และตรวจ diff เฉพาะงาน ก่อนสั่ง commit งาน reconciliation browser acceptance ยังค้างแยกต่างหาก

## ปิดงาน Goals — 17 กันยายน 2026 (Asia/Bangkok)

ผู้ใช้ยืนยัน browser acceptance ของ Goals ผ่านแล้วในวันที่ 17 กันยายน 2026 ผลนี้เป็นการตรวจรับโดยผู้ใช้ ไม่ใช่ browser automation โดย AI และไม่ใช่การยืนยัน browser acceptance ของ reconciliation แทนกัน

AI รันรอบสุดท้าย: Goals27 tests + regression40 tests =67ผ่าน ไม่มีfail/skip; backend/frontend buildผ่าน คงคำเตือน frontend bundleเกิน500kB ตรวจ prisma migrate status แบบอ่านอย่างเดียวได้9 migrations และ up to date ไม่ apply/reset/resolve/db push หรือแก้ migration ในรอบปิดงาน

เลือก commit เฉพาะ20 paths ของ Goals รวม schema/migration, services/routes, Transaction guards, หน้า Goals/shared navigation และเอกสาร ใช้ partial staging แยกสูตร reconciliation ใน backend/src/index.ts และส่วนบันทึก reconciliation ออก โดยคง workspace เดิมไว้ schema.prisma/App.tsx มีฐานโค้ดเดิมที่ยังไม่เคยcommitและจำเป็นต่อintegrationจึงรวมทั้งไฟล์ CSS shared navigation เดิมยังuntrackedจึงรวมทั้งไฟล์ ไม่รวมpackage/config/migrationเก่าหรือหน้าอื่น ผลtests/buildเป็นของworkspaceปัจจุบัน ไม่ใช่การรับรองclean checkoutที่ยังขาดไฟล์ฐานค้างนอกcommit

ไม่มี .env/secrets/node_modules/dist/logs/database dump หรือไฟล์ฐานข้อมูลทดสอบรวมในcommit รวมเฉพาะtest sourceและrunnerที่เกี่ยวข้อง ไม่ push รายละเอียดอยู่ GOALS_IMPLEMENTATION.md

## อัปเดต 19 กันยายน 2026 — Settings

พัฒนาหน้า Settings 4 ส่วนตามภาพที่มีจริง docs/mockups/User-settings.png ใช้ layout/header/bell เดิม ไม่มี annotation หรือข้อมูลตัวอย่างจากภาพ; ผู้ใช้ยืนยัน browser acceptance ผ่านวันที่ 19 กันยายน 2026 แยกจาก automated tests ของ AI; ปิดงานเฉพาะ Settings โดยไม่ push

เพิ่ม atomic GET/PUT /settings ใช้ Profile persistence เดิมร่วมกัน, income Decimal string, payday 1–31/clamp สิ้นเดือน, Budget เดือนปัจจุบัน Bangkok, primary Goal ของบัญชีเดียวกันและรักษา archived pointer/legacy Profile.goal โดยไม่สร้าง Goal/Transaction อัตโนมัติ

เพิ่ม authenticated avatar Bytes/bytea JPEG/PNG/WebP <=1 MB พร้อม MIME/signature checks และ Blob URL cleanup; เพิ่ม change-password/close-account dialogs, authVersion JWT revocation (legacy token =0), soft closure ไม่ hard-delete ประวัติ; ป้องกัน stale session responses และเตือน dirty navigation/logout

near/exceeded ใช้ BudgetNotificationSetting/producer เดียวกับ Budget; เพิ่ม notifyNearLimit, enabled = near OR exceeded, รักษา threshold/scope เดิม; anomaly/weekly summary disabled ไม่มี preference ที่ไม่มี consumer

Migration ใหม่ 20260919010000_add_user_settings: ตรวจ checksum 9 applied migrations เดิมตรงทั้งหมด ทดสอบบนฐานแยกก่อน apply กับ local; ล่าสุด 10 migrations up to date ตรวจ fingerprint 9 ตารางการเงิน/Goals/Notification เดิมไม่เปลี่ยน ไม่ reset/db push/seed/แก้ applied migration

ผลรันจริง: Prisma validate/generate และ backend/frontend build ผ่าน; 77 automated tests (Settings เพิ่ม10 + Goals27 + notification/reconciliation40 รวม parent tests) ผ่าน ไม่มี fail/skip บนฐานทดสอบแยก มี HTTP/PostgreSQL/concurrency จริง Chrome DevTools automation แบบ API double ผ่าน responsive/keyboard/focus/dirty navigation/session race/Blob cleanup แยกจาก user browser acceptance ไม่มี package ใหม่ของแอป

รายละเอียด API/validation/migration/tests/รายชื่อไฟล์/checklist และข้อจำกัดอยู่ SETTINGS_IMPLEMENTATION.md หลักฐาน runtime อยู่ .git/settings-verification ไม่รวมใน Git; ไฟล์ local ที่ค้างมาก่อนรักษาไว้ทั้งหมด
ปิดงาน Settings 19 กันยายน 2026: เปลี่ยนชื่อ mockup เป็น docs/mockups/User-settings.png และเพิ่ม migration.sql -text ใน .gitattributes ของ migration Settings ตาม convention เดิม โดยไม่เปลี่ยน bytes ของ SQL ที่ apply แล้ว ไฟล์ local ที่ไม่เกี่ยวข้องคงไว้นอก commit

## Monthly Dashboard — 19 กันยายน 2026 (Asia/Bangkok)

เปลี่ยน /overview เป็น Dashboard รายเดือนผ่าน ?month=YYYY-MM และเพิ่ม GET /dashboard โดยไม่เปลี่ยน GET /overview หรือ /overview/weekly เดิม ไม่อนุญาตเดือนอนาคต ใช้ asOfDate Bangkok ครั้งเดียวต่อ request และ UTC surrogate dates เดือนปัจจุบันถึงวันนี้ เดือนย้อนหลังครบเดือน

รวม Transaction จริงด้วย DB groupBy และ Prisma Decimal ส่งเงินเป็นstring รายรับ/รายจ่าย/cash flow/งบคงเหลือ งบไม่มีค่าเป็นnull และติดลบได้ รายหมวดครบทุกหมวดกับรายวันตรวจผลรวมเทียบ summary ได้ รายการล่าสุด5เรียง transactionDate/createdAt/id แบบ deterministic ไม่รวม Profile.income หรือเงิน Goals เป็นรายรับ/รายจ่าย

Goals แสดงสถานะปัจจุบัน active/not_started/overdue แยกกัน ใช้ calculateGoal เดิม และ canonical netGoalAllocation helper ร่วมกับ goalSaved รวม ledger ของ correction/release/replacement ถูกต้อง เงินจัดสรรรวม completed/archived ด้วย primaryGoal ของ Settings เก็บสถานะ archived ให้เห็น ไม่สร้าง snapshot ย้อนหลัง

Frontend ใช้ AppLayout/UserHeader/Bell เดิม SVG/CSS พร้อมตาราง keyboard-accessible แยกไม่มีรายการ/ยอด0ที่บันทึก/วันอนาคต มี loading/empty/error/retry, responsive และ keyed month/session + abort/active/token guards เพิ่ม /transactions?month ให้กรองใน DB และ History รองรับ URL โดยไม่มีmonthรักษาพฤติกรรมเดิม

ลบ WeeklyExpenses.tsx/CSS หลังตรวจว่ามี Overview เรียกเพียงหน้าเดียว คง overviewPeriod.ts เพื่อ regression วันที่ของ contractเก่าที่ test ยังอ้างถึง ไม่มีruntime importในDashboardใหม่ ไม่เพิ่ม Analysis/Data Readiness/dependency/schema/migration

ผล AI รันจริง: Prisma validate/generate และ buildทั้งสองฝั่งผ่าน (bundle warningเดิม); Dashboard14 + regression77 =91testsผ่าน0fail/skip บนฐานทดสอบใหม่แยก Chrome API-double8กลุ่มผ่านรวม responsive/keyboard/monthและsessionrace/History links ตรวจ SQLจริงพบ Transaction GROUP BY3query และ latest LIMIT1query พร้อม user/date predicates; ledger GROUP BY1query ไม่โหลดTransaction/ledgerทั้งบัญชีเข้าmemory

ผู้ใช้ยืนยัน browser acceptance ของ Dashboard และ History month filter ผ่านวันที่ 20 กันยายน 2026 แยกจาก automated tests ของ AI รายละเอียดอยู่ DASHBOARD_IMPLEMENTATION.md ปิดงานเฉพาะ Dashboard โดยไม่ push และคงไฟล์ local เดิม ข้อจำกัด: Goal metadata ยังอ่านทั้งหมดของบัญชี และยังไม่ benchmark ฐานขนาดใหญ่

ปิดงาน Dashboard 23 กันยายน 2026: staged candidate แยกตรงกับ index ทั้ง329ไฟล์; npm ci จาก lockfiles ของ candidate, Prisma validate/generate, backend/frontend build และ Dashboard14+regression77=91testsผ่าน ไม่มีfail/skip; Chrome API-mock8กลุ่มผ่านกับ buildของcandidate แยกจาก browser acceptance โดยผู้ใช้20กันยายน2026 เลือกเฉพาะ18paths ไม่รวมlocalเดิมและไม่push npm ciรายงานช่องโหว่backendเดิม6รายการ(1moderate/5high), frontend0 ไม่แก้dependencyนอกขอบเขต

## Transaction screening — 24 กันยายน 2026 (Asia/Bangkok)

พัฒนาระบบคัดกรอง expense ที่ควรตรวจสอบด้วยกฎสถิติ ไม่ใช่การยืนยันการทุจริต ใช้ประวัติ auth user/หมวดเดียวกันย้อนหลัง180วันก่อนวันรายการ จำนวนเงิน modified Z/MAD, IQR fallback และ zero-dispersion ตามกติกาที่อนุมัติ; ทุก flag ใช้ strict threshold และข้อมูลไม่พอเป็น not_evaluated เวลาใช้เฉพาะ Bangkok wall-clock ที่ผู้ใช้ยืนยัน ไม่ใช้ createdAt

เปิด Settings notifyAnomaly จริง defaultfalse ไม่มี backfill; Add/Edit ไม่เติมและยืนยันเวลาอัตโนมัติ NotificationBell/รายละเอียด Transaction เดิมแยก snapshot ตอนแจ้งกับ latest evaluation พร้อมสถานะต้นทางแก้/ลบและ session guard ไม่มีหน้าใหม่/dependencyใหม่

Migration 20260923010000_add_transaction_anomaly เพิ่ม preference, revision/pending, append-only Evaluation พร้อม PostgreSQL trigger กัน UPDATE/DELETE/ผิด ownership และ partial pending index. ทดสอบ migrate upgrade10→11บนฐานแยกพร้อม legacy timed row ยืนยัน confirmationfalse/no backfill. ฐานใช้งานจริงยังมี10 applied migrations checksumตรงทั้งหมด และ migrationใหม่ยัง pending ไม่ได้ apply

CRUD, toggle และ finalize ใช้ user row lock/authVersion protocol เดิม; producer failure ไม่ทำให้ CRUD ที่ commitแล้วล้มเหลว; eventKey transaction-anomaly:<transactionId> หนึ่ง notificationตลอดอายุรายการ; revisionใหม่เก็บEvaluationไม่แก้snapshotเก่า; ลบก่อนตรวจยกเลิกpendingไม่สร้างผลหลังลบ. POST /notifications/anomaly/reconcile แยกจาก budget contract เดิม limit1–50/cursor ตรวจlatestrevisionเท่านั้น ไม่มีประเมินรายการอื่นย้อนหลังเมื่อbaselineเปลี่ยน

ผล AI รันจริงรอบสุดท้าย:109testsผ่าน0fail/skip (รวม18 anomaly calculation/HTTP/PostgreSQL/concurrency tests และ91regressionเดิม); Prisma validate/generate และ build backend/frontendผ่าน; Chrome API mocks anomaly7กลุ่ม, Settings11กลุ่ม, Dashboard8กลุ่มผ่าน รวมresponsive/keyboard/error/retry/delayed session response; query PostgreSQLจริงคืนaggregateแถวเดียวพร้อมuser/category/window predicates ไม่มีโหลดประวัติทั้งบัญชีเข้าNode memory

Browser acceptance กับ backendจริงของงานนี้ยังไม่ได้ทดสอบโดยผู้ใช้ ต้องอนุมัติและapply migrationฐานใช้งานจริงก่อนเปิดใช้ ไม่อ้างผลAPI mocksแทน acceptance. ยังไม่มีscheduler/durable queue/event log มีpending flagรองรับretry revisionล่าสุด ต้องกดตรวจค้าง/เรียกreconcileหากprocessหยุดหลังCRUD. Synthetic calibrationตรวจขอบกฎ ไม่ใช่อัตราความแม่นยำจริง

รายละเอียดschema/API/lifecycle/files/ข้อจำกัดอยู่ ANOMALY_IMPLEMENTATION.md และ ANOMALY_CALIBRATION.md; หลักฐานruntimeใน.git/settings-verificationไม่รวมGit. ไม่แก้สูตรรายงานเดิม/Goals allocation ไม่ใช้ข้อมูลผู้ใช้อื่นทำfixture ไม่แตะไฟล์localเดิม และยังไม่stage/commit/push
## Anomaly user feedback — 24 กันยายน 2026

เพิ่ม append-only AnomalyReview + AnomalyReviewRequest receipts ด้วย migration แยก 20260924010000_add_anomaly_review; ไม่แก้ bytes migration anomaly เดิมที่เคยapplyแล้ว. FK/triggerบังคับownership/evaluation/revision/sequence และปฏิเสธUPDATE/DELETE เก็บหลักฐานหลังTransactionลบได้

Baseline ใช้revisionปัจจุบันเท่านั้น: pending/problem/flagged-unreviewed ไม่เข้า, normalหรือnot_flaggedเข้าได้, not_evaluatedเพราะข้อมูลประวัติไม่พอเข้าได้เพื่อcold start. แยกamount/time eligibility โดยเวลาต้องมีและผู้ใช้ยืนยัน; reviewเก่าไม่ผูกrevisionใหม่ตลอดไป. การแก้ค่าTransactionรวมnote/description/paymentMethodสร้างrevisionใหม่; PUTค่าเดิมไม่เพิ่มrevision. Technicalfailureยังpendingไม่สร้างผลปลอม

POST /anomaly/evaluations/:id/reviews ใช้Idempotency-Key/fingerprint/expectedReviewSequence/userlock/authVersion; replay/no-opไม่appendซ้ำ, conflict409. GET reviewsมีpagination; รายละเอียดเดิมแยกreviewState/currentRevision/latestEvaluation/notificationSnapshot/eligibilityพร้อมเหตุผล. UIยืนยันnormal/problemและhistoryอยู่ในรายละเอียดเดิม อ่านnotificationไม่ใช่review. Feedbackไม่แก้snapshot/threshold ไม่backfill. เพิ่มpolicy versionในconstantsครั้งนี้โดยไม่เปลี่ยนstatistical thresholds

ทดสอบฐานว่าง12migrations+119tests และฐานทดสอบเดิม11→12+28focusedtestsผ่าน; fingerprintตารางเดิมก่อน/หลังmigrationไม่เปลี่ยน. Chrome review API mocks6กลุ่มผ่าน และregression anomaly7/Settings11/Dashboard8ผ่าน (Dashboardรอบรวมมีmonth-race timing failure ก่อนรันแยกซ้ำผ่านโดยไม่แก้Dashboard). Browser acceptanceของผู้ใช้ยังไม่เกิดขึ้นในรอบนี้. รายละเอียด/ไฟล์/ข้อจำกัดอยู่ ANOMALY_IMPLEMENTATION.md

ฐานapplicationยัง10applied มีanomalyและreviewรอapply; ไม่applyฐานจริง ไม่stage/commit/push และรักษาไฟล์localเดิมทั้งหมด
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

## Category Forecast — 26 กันยายน 2026 (Asia/Bangkok)

Implement ตามแบบที่ผู้ใช้อนุมัติ: /forecast แยกหน้า ใช้ Holt linear trend รายหมวดและรวมผลเฉพาะหมวดที่พร้อมหลังปัด Decimal ไม่มี Holt ยอดรวมคู่ขนาน ฝึกถึงเมื่อวานและพยากรณ์วันนี้ถึงอีก6วัน รวม7วัน ใช้ย้อนหลังไม่เกิน180วัน;เกณฑ์ v1 ต่อหมวด42วันปฏิทิน/14วันที่มีexpense/มีexpenseใน7วันเต็มล่าสุด ไม่มีการอ้างความแม่นยำจากเกณฑ์

Initialization OLS7วันแรก,grid121คู่ alpha/betaStar,inner chronological folds3x7วัน,outputติดลบclamp0,policyทุกส่วนอยู่ใน modelVersion; missing daysเติม0สำหรับseriesพร้อมwarningไม่ได้ยืนยันไม่มีรายจ่ายจริง ไม่เติมfuture ไม่รวมProfile/Goals และไม่ตัดexpenseตามanomalyreview

GET /forecast auth userเท่านั้น ไม่รับquery client,RepeatableRead snapshot,จับasOfDateครั้งเดียว,private no-store,DB GROUP BYตามuser/type/category/date bounded180วันถึงวันนี้ ไม่มีfull-row history read GET /dashboardเดิมไม่เปลี่ยน เพิ่มเพียงลิงก์จากOverview/Sidebar ใช้layout/header/bellเดิม ไม่มี migration/dependency ใหม่

available/partial/unavailable;unavailable forecastเป็นnull;partialเทียบactual7วันเฉพาะชุดหมวดที่forecastได้ ห้ามสรุปโดยรวมอยู่ในงบเมื่อหมวดขาด งบใช้actualเดือนนี้ทุกหมวดถึงปัจจุบัน หักactualวันนี้จากforecastวันนี้แยกหมวดก่อนเทียบวงเงินk/rของงบเหลือ คาดการณ์ครบ7วันแต่เทียบงบเฉพาะวันในเดือนนี้ งบเกินแล้วdailyadvice0 ไม่ติดลบ

ผล AI รันจริงรอบสุดท้าย:136testsผ่าน0fail/skip รวมcalculation,HTTP,PostgreSQL,backtest,Dashboard/Goals/Settings/Anomaly/Review/Notifications/Reconciliation ฐานทดสอบแยก (initial empty DB apply12 migrationsเดิมครบ ไม่มีเปลี่ยนapplication) Prisma validate/generate และ backend/frontend buildผ่าน ทั้งworkspaceและcandidateที่ไม่รวมlocalApp.css/packagechanges มีbundle warning>500kBเดิม

Chrome/API mocksผ่านForecast6กลุ่ม,Dashboard17กลุ่มรวม10controlledmonthrounds,Anomaly7,Review6,Settings12 ตรวจkeyboard/mobile/longnames/retry/session/navigationrace
แก้productเฉพาะForecast:ไม่ถอดDOMเมื่อrefreshในsessionเดิมเพื่อรักษาkeyboardfocus และจำกัดselectชื่อหมวดยาวไม่ให้ล้นจอ
Regressionพบtest AnomalyReview observerอ่านpg_stat_activityในtransactionที่ถือlock จึงแก้เฉพาะtests/anomalyReview.database.test.ts ใช้autocommit observerอีกconnectionตรวจpg_blocking_pidsตรงlocker และassert401หลังrevocation ไม่เพิ่มrandomsleepหรือแก้productionAnomaly;ผลfullsuiteหลังแก้136ผ่าน

Backtestเป็นsynthetic3scenarios/8outerwindowsพร้อมcounterfactualfuturecheck ไม่ใช้ข้อมูลจริงผู้ใช้อื่น Variable fixture MAE75.80–87.10บาท/RMSE80.35–92.03บาท coverageรายงานแยก ไม่คัดหมวดตามaccuracy ดู FORECAST_BACKTEST_REPORT.md ไม่ใช่หลักฐานความแม่นยำกับผู้ใช้จริง
รายละเอียดAPI/สูตร/ข้อจำกัด/รายการตรวจรับอยู่ FORECAST_IMPLEMENTATION.md ผู้ใช้ยังไม่ได้ทำForecast browser acceptanceกับbackendจริง ต้องตรวจสถานะครบ/partial/unavailable,งบไม่มี/ครบ/เกิน,ข้ามเดือน,ตารางหมวด/ยอดรวม,CRUD refresh และsession/mobile/keyboard
ไม่มีภาพรูป12ต้นฉบับ จัดตามข้อกำหนดข้อความที่อนุมัติ ยังไม่อ้างว่าlayoutตรงภาพ
รักษาlocalเดิม .env.example/docker-compose/App.css/rootpackage/seed/placeholderทั้งหมด ไม่stage/commit/push


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


## Behavior — 26 กันยายน 2026 (Asia/Bangkok)
พัฒนาหน้า /behavior และ GET /behavior ตามข้อกำหนดรวมเล่มที่ผู้ใช้ระบุ 2.2.2.6/วิธีวิเคราะห์/5.3.1–5.3.2 ใช้ AppLayout/UserHeader/Bell เดิม เพิ่มลิงก์ Sidebar/Overview ไม่สร้าง Analysis/Data Readiness ไม่เปลี่ยน Dashboard/Forecast/Anomaly contracts ไม่มี migration/schema/dependency ใหม่

เลือกช่วงไม่เกิน366วันเต็มถึงเมื่อวาน Bangkok ค่าเริ่มต้น30วัน ช่วงก่อนหน้ายาวเท่ากันและไม่ทับกัน ใช้ auth expense เท่านั้น เงิน Decimal string รวม flagged/pending/confirmed_problem ที่ยังเป็นTransaction ไม่มี Profile/Goals
แต่ละช่วงพร้อมเมื่อ>=30รายการและ first..last expense inclusive>=30วัน; ถ้าฝั่งใดไม่พร้อม comparison=null ทั้งsummary/category/weekday และไม่มีข้อค้นพบเปรียบเทียบ ข้อเท็จจริงยังแสดงได้ ไม่อ้างว่าข้อมูลครบหรือมีนัยสำคัญ
รายหมวดรวมไม่ระบุหมวดด้วยLEFT JOIN; schemaเดิมมีFKห้ามorphan จึงไม่แก้constraintเพื่อทดลอง กราฟจัดตามdayIndexมีวันที่จริงทั้งสองฝั่งและhasExpenseRecords แยกไม่มีรายการจากยอดศูนย์ วันในสัปดาห์มีcalendarOccurrencesและค่าเฉลี่ยต่อวันประเภทนั้น
เวลายืนยันเท่านั้น bucket4ชั่วโมง เกณฑ์30confirmed/coverage80%/bucket50%/5distinctdays; guardข้อค้นพบรายหมวด5รายการ3วันต่อช่วง กฎหลายเงื่อนไขยอด/จำนวน/เฉลี่ย/สัดส่วน พร้อมevidenceและคำแนะนำไม่อ้างเหตุและผล
Possible recurrence หมวด+ยอดเดียวกัน>=3วัน วันละ1รายการ ห่าง7วันตรงทุกครั้งหรือเดือนติดกันวันเดียว/สิ้นเดือน SQLกรองและLIMIT51 แสดง50+hasMore ไม่เรียกบิล/subscription ไม่สร้างTransactionอนาคต

AIรันจริง:Prisma validate/generate,backend/frontend buildผ่าน;158testsผ่าน0fail/skip รวมBehavior22และregressionเดิม136 บนฐานทดสอบใหม่12migrationsเดิมครบ ไม่แก้ฐานapplication;SQLตรวจ3boundedaggregate queries ไม่มีfull-row history/ledger read
Chrome API mocks Behavior9กลุ่มผ่าน (category/date/session race,keyboard/mobile/retry) พร้อมForecast/Dashboard/Anomaly/Review/Settings regressionผ่าน ยังไม่ใช่user browser acceptance/backendจริง;ผู้ใช้ต้องตรวจตาม checklistใน BEHAVIOR_IMPLEMENTATION.md
คงlocal12ไฟล์เดิม ไม่stage/commit/push Existing AnomalyReview observer fixถูกใช้ในworkspace regressionแต่ไม่แก้/รวมในงานBehavior;ยังมีbundle warning>500kBและไม่มีproduction-scale benchmark
ไฟล์ใหม่:backend/src/lib/behavior.ts,behaviorRules.ts;routes/behavior.ts;tests/behavior.test.ts,behavior.database.test.ts,behavior.browser.cjs,runBehaviorDatabase.cjs;frontend/src/pages/Behavior.tsx,Behavior.css;BEHAVIOR_IMPLEMENTATION.md
ไฟล์ร่วมแก้เฉพาะmount/route/link:backend/src/index.ts,frontend/src/App.tsx,components/Sidebar.tsx,pages/Overview.tsx และบันทึกนี้

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

## Weekly expense chart restored - 27 September 2026 (Asia/Bangkok)

Current branch inspection found only the daily chart in Overview; GET /overview/weekly still existed. Added a separate weekly chart below the monthly Dashboard without changing monthly cards, Behavior, Forecast, backend formulas or API contracts. No migration/dependency changes.

WeeklyExpenses uses the existing authenticated expense-only API with startDate/endDate. Default range is the selected Dashboard month (current month ends today); custom range up to 366 days and category/all-category controls affect this section only. Changing Dashboard month resets weekly controls to that month. Weeks are Monday-Sunday clipped to range, chronologically sorted. Category filtering uses per-week category aggregates returned by the same API. Frontend total sums integer satang with BigInt; numeric API values outside safe cent range show error instead of silently displaying inaccurate totals. SVG conversion to Number is for geometry only.

Includes explicit no-record empty state, per-week missing-record markers, accessible data table, keyboard controls, horizontal graph scrolling on mobile, loading/error/retry and active/AbortController/session checks. Transaction change events refresh the weekly data. No weekly notifications are created.

AI verification: frontend/backend builds PASS; 13 focused unit/date/Dashboard tests PASS; 13 real HTTP/PostgreSQL reconciliation tests PASS on isolated test database using rollback, including independent totals, empty/income-only, decimal, leap/year/month boundaries, category totals, CRUD and account separation. Weekly browser API mocks PASS (filtering, graph/table, empty/retry, range/session race, mobile); Dashboard browser regression PASS including 10 controlled month races. Initial weekly browser fixture selected a range longer than 366 days; corrected fixture to a date relative to current month, preserving assertions. No application database connection/writes.

Behavior and Forecast browser API-mock regression also PASS.

User browser acceptance subsequently passed on 27 September 2026 (see separate user acceptance below). Check /overview, select dates and category, compare bars/table sum with expense Transactions in the same scope, check an empty range and mobile/keyboard. Monthly cards retain their month scope.
Existing limitations retained: legacy weekly API returns numeric money and loads only the selected range's transaction rows; no new database aggregation or API contract refactor in this UI task. Existing frontend bundle >500 kB warning remains.
No stage/commit/push; preserve the original 12 local paths.

## Weekly chart user acceptance — 27 กันยายน 2026 (Asia/Bangkok)
ผู้ใช้ยืนยันว่า User acceptance ของกราฟรายจ่ายย้อนหลังรายสัปดาห์ผ่านแล้ว วันที่ 27 กันยายน 2026 (Asia/Bangkok) บันทึกนี้เป็นผลตรวจรับของผู้ใช้ แยกจาก automated tests และ browser verification ของ AI ที่รายงานไว้ก่อนหน้า และแทนสถานะที่เคยระบุว่ายังรอตรวจรับ
AI ตรวจ browser/backend/PostgreSQL acceptance จริงก่อนหน้านี้แล้ว: ช่วงวันที่/หมวด สัปดาห์คร่อมเดือน ยอดสตางค์ ช่วงว่าง keyboard/mobile และการ์ด Dashboard รายเดือนคงเดิม การเปลี่ยนหมวดกรอง aggregate ที่โหลดแล้วใน frontend จึงไม่ส่ง GET ใหม่; การเปลี่ยนช่วงวันที่ที่ถูกต้องส่ง GET /overview/weekly และได้ 200
รอบบันทึก acceptance นี้ไม่ได้รัน tests ใหม่ จัด stage เฉพาะ allowlist งาน Weekly 8 ไฟล์เพื่อให้ผู้ใช้ตรวจ staged diff ยังไม่ commit หรือ push ข้อมูลบัญชี acceptance, credentials, logs และ screenshots ไม่รวมใน staged files
