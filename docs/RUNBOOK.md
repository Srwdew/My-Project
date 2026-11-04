# RUNBOOK

เขียนจากไฟล์ใน repository เมื่อ 3 พ.ย. 2026 ป้าย **[ยังไม่ยืนยัน]** แปลว่าตรวจจากไฟล์ไม่ได้ เอกสารนี้ไม่มีค่าจริงจากไฟล์ `.env` ใด ๆ ผู้เขียนไม่ได้ต่อฐานหลัก และคำสั่งฐานหลักในหัวข้อ 3 ยังไม่เคยซ้อมตามเอกสารนี้

## 1. ความต้องการของระบบ

| รายการ | ค่าจากไฟล์ | แหล่ง |
|---|---|---|
| ฐานข้อมูล | PostgreSQL 16 ผ่าน Docker, container `SpendSense-db`, host port 5433 ไป 5432, volume `SpendSense_pgdata` | `docker-compose.yml` |
| Node.js | **[ยังไม่ยืนยัน]** ไม่มี `engines` หรือไฟล์ pin เครื่องที่รันเทสต์ล่าสุดใช้ v24.19.0 | `package.json` |
| Backend | Express 5, Prisma 7, พอร์ตเริ่มต้น 4000 | `backend/package.json`, `backend/src` |
| Frontend | React 19, Vite 8, พอร์ต dev 5173 และ proxy ไปพอร์ต 4000 แบบคงที่ | `frontend/package.json`, `frontend/vite.config.ts` |
| OCR อ่านละเอียด (ไม่บังคับ) | Python 3.13, PaddleOCR | `ocr-service/README.md` |
| เทสต์ browser | Google Chrome | `backend/tests/runAll.cjs` |

## 2. ติดตั้งจากศูนย์

ใช้กับฐานใหม่ที่ว่างเท่านั้น ถ้ามีฐานที่มีข้อมูลอยู่แล้วให้ใช้หัวข้อ 3

1. คัดลอกชื่อตัวแปรจาก `.env.example` ไปตามไฟล์ที่ระบุในนั้น แล้วตั้งค่าเอง อย่า commit ไฟล์ `.env`
2. จาก root เปิดฐาน: `docker ps -a` แล้ว `docker compose up -d`
3. จาก `backend/`: `npm ci` แล้ว `npx prisma generate`
4. จาก `backend/` ตรวจว่า `DATABASE_URL` ชี้ฐานใหม่จริง แล้ว `npx prisma migrate deploy`
5. จาก `frontend/`: `npm ci` และ `npm run ocr:assets` ซึ่งอาจดาวน์โหลดโมเดล ให้ตรวจ diff หลังรัน
6. เปิด `npm run dev` จาก `backend/` ก่อน แล้วจึงเปิดจาก `frontend/`

`npx prisma generate` ไม่สร้างตาราง ไม่มี npm script รวมขั้นตอนเหล่านี้ และ **[ยังไม่ยืนยัน]** ขั้นตอนทั้งชุดยังไม่เคยซ้อมบนเครื่องเปล่า

## 3. Migrate ฐานหลัก

ทำเมื่อเจ้าของโครงการตัดสินใจแล้วเท่านั้น อ่านหัวข้อ 4 ก่อน

### สำรองข้อมูล

ปิด backend ก่อน แล้วสำรองออกนอก repository:

~~~powershell
docker exec SpendSense-db pg_dump -U SpendSense_user -d SpendSense -Fc -f /tmp/spendsense.dump
docker cp SpendSense-db:/tmp/spendsense.dump <โฟลเดอร์นอก-repo>\spendsense-<วันที่>.dump
docker exec SpendSense-db rm /tmp/spendsense.dump
~~~

ไฟล์สำรองมีข้อมูลการเงินจริง ห้ามเข้า Git ทดลองกู้ลง container ชั่วคราวก่อนเชื่อว่าไฟล์ใช้ได้

### ตรวจก่อนรัน

1. จาก `backend/` รัน `npx prisma migrate status` ดูว่า target คือฐานที่ตั้งใจ และมี migration ใดค้าง
2. เทียบรายการค้างกับหัวข้อ 5 ถ้าไม่ตรงให้หยุดและหาสาเหตุ
3. อ่าน SQL ของทุก migration ที่จะรัน
4. จดจำนวนแถวไว้เทียบ ใช้คำสั่งนี้เท่านั้น เพราะ PowerShell ตัดเครื่องหมาย `"` ครอบชื่อตารางทิ้งถ้าส่งผ่าน `-c`:

   ~~~powershell
   'select (select count(*) from "User") users,(select count(*) from "Transaction") tx,(select count(*) from "Goal") goals,(select count(*) from "Budget") budgets;' | docker exec -i SpendSense-db psql -U SpendSense_user -d SpendSense
   ~~~
5. ซ้อม `migrate deploy` กับฐานที่กู้จากไฟล์สำรองลง container ชั่วคราว

### รัน

จาก `backend/`: `npx prisma migrate deploy` ห้ามใช้ `migrate dev` หรือ `migrate reset` กับฐานนี้

### ตรวจหลังรัน

1. `npx prisma migrate status` ต้องไม่เหลือรายการค้าง
2. รันคำสั่งนับแถวข้างบนอีกครั้ง จำนวนต้องเท่าเดิม
3. เปิด backend และ frontend แล้วเข้าสู่ระบบ ดูภาพรวม เพิ่มรายการทดสอบหนึ่งรายการ แล้วลบ
4. ตรวจผล `RULE_VERSION` ตามหัวข้อ 4

### ย้อนกลับ

ไม่มี down migration ใน `backend/prisma/migrations` การย้อนจึงเท่ากับกู้จากไฟล์สำรอง และข้อมูลที่เกิดหลังสำรองจะหาย ปิด backend แล้วกู้:

~~~powershell
docker cp <ไฟล์สำรอง> SpendSense-db:/tmp/spendsense.dump
'CREATE DATABASE spendsense_restore;' | docker exec -i SpendSense-db psql -U SpendSense_user -d postgres
docker exec SpendSense-db pg_restore -U SpendSense_user -d spendsense_restore /tmp/spendsense.dump
~~~

ตรวจ `spendsense_restore` ก่อน แล้วชี้ `DATABASE_URL` ไปฐานนี้หรือเปลี่ยนชื่อฐานด้วยตัวเอง และย้อนโค้ดกลับ commit ก่อน migrate ด้วย ห้ามใช้ `docker compose down -v` เพื่อย้อนกลับ

## 4. คำเตือน

- **`RULE_VERSION` เปลี่ยนสองครั้ง** ใน `ANOMALY_RULE` (ขั้นที่ 1 เพิ่มตัวตรวจการขยับระดับ ขั้นที่ 2 เปลี่ยนขั้นต่ำต่อหมวดเป็น 10/5/14) ค่านี้เป็น hash ของกฎ เมื่อโค้ดใหม่รันกับฐานใด `reconcileAnomalies` จะประเมินรายจ่ายย้อนหลังทุกรายการของผู้ใช้ที่เปิดแจ้งเตือนใหม่ภายใต้เวอร์ชันใหม่ ผู้ใช้เหล่านั้นอาจเห็นรายการที่ควรตรวจเปลี่ยนไป ต้องอนุมัติก่อนรัน ดู [ANOMALY_LEVEL_SHIFT_BACKTEST](ANOMALY_LEVEL_SHIFT_BACKTEST.md) หลักฐานทั้งหมดเป็นข้อมูลสังเคราะห์
- **เทสต์ต้องไม่ต่อฐานหลัก** ถ้าเห็น `[test guard]` อย่าแก้ `.env` ให้ผ่าน ดู ISSUE-TEST-3 ใน [DECISIONS](DECISIONS.md)
- **ห้าม** `docker compose down -v`, ลบ volume หรือ `prisma migrate reset` โดยไม่ได้รับอนุญาต
- **การเปลี่ยน `POSTGRES_PASSWORD` ไม่เปลี่ยนรหัสใน volume เดิม**
- **ไม่มี ErrorBoundary** error ตอน render ทำให้ขาวทั้งแอป ควรมีก่อนใช้งานจริง (ISSUE-UI-3)
- **`npm run test:all` ยังใช้เป็นด่านก่อน commit ไม่ได้** ดูหัวข้อ 6

## 5. สถานะ migration บนฐานหลัก

ใน repository มี 26 migration **รันครบบนฐานหลักแล้วเมื่อ 4 พ.ย. 2026** เจ้าของโครงการรัน `migrate deploy` เอง ทั้ง 4 ตัวในตารางผ่าน และจำนวนแถวก่อนหลังเท่ากัน ก่อนหน้านั้นซ้อมกับสำเนาจากไฟล์สำรองแล้ว ถ้าเพิ่ม migration ใหม่ให้รัน `npx prisma migrate status` ตรวจอีกครั้ง

| Migration | สถานะที่มีหลักฐาน |
|---|---|
| `20261101010000_add_recommendation_log` | รันแล้ว 4 พ.ย. 2026 |
| `20261102010000_add_anomaly_level_shift` | รันแล้ว 4 พ.ย. 2026 |
| `20261102020000_level_shift_reopen` | รันแล้ว 4 พ.ย. 2026 |
| `20261104010000_add_alert_notification_type` | รันแล้ว 4 พ.ย. 2026 |

ในตาราง `_prisma_migrations` มีแถวเก่าของ `20260912100456_remove_transaction_status_and_add_category_budgets` ที่ถูก rollback และรันสำเร็จภายหลัง ไม่ใช่ความผิดปกติ

## 6. การรันเทสต์

รันจาก root หรือ `backend/` ได้ ตัวรันสร้าง PostgreSQL ชั่วคราวเอง ไม่ต่อฐานหลัก

| คำสั่ง | ขอบเขต | ต้องมี |
|---|---|---|
| `npm test` | unit + db และบอกจำนวน browser ที่ไม่ได้รัน | Docker |
| `npm run test:unit` | unit | - |
| `npm run test:db` | ฐานชั่วคราว | Docker |
| `npm run test:browser` | browser | Docker, Chrome, พอร์ต 4000 ว่าง |
| `npm run test:all` | ทั้งหมด | ทั้งหมดข้างต้น |

ผลชุดเต็มล่าสุด (3 พ.ย. 2026): ผ่าน 65 ล้ม 15 รายชื่อที่ล้มอยู่ใน ISSUE-TEST-4 ของ [DECISIONS](DECISIONS.md) ยังไม่ยืนยันว่าล้มเพราะเทสต์เก่าหรือระบบพัง ไฟล์เทสต์ใหม่ต้องจัดกลุ่มใน `backend/tests/runAll.cjs` และตัวรันเก่า 16 ตัว (`tests/run*.cjs`) ไม่ถูกเรียกจากคำสั่งเหล่านี้
