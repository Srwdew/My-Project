# SpendSense

ร่างคู่มือจาก working tree ที่ตรวจเมื่อ 21 ตุลาคม 2026 (Asia/Bangkok) ไม่ใช่การรับรอง production readiness หรือผลทดสอบใหม่ มี local changes ที่ยังไม่ commit รวมงาน Behavior ล่าสุด

SpendSense เป็นเว็บจัดการการเงินส่วนบุคคล: บันทึกรายรับ/รายจ่าย งบประมาณ เป้าหมายการออม ภาพรวม Forecast, Behavior, Anomaly และการตั้งค่าบัญชี มีหน้า Admin และระบบกู้รหัสผ่านที่เปิดใช้ตาม configuration

## เริ่มอ่าน

- [การพัฒนาและคำสั่งที่ตรวจจาก repository](docs/DEVELOPMENT.md)
- [พฤติกรรมปัจจุบัน / ข้อกำหนดยืนยัน / เรื่องรอตัดสินใจ](docs/DECISIONS.md)
- [ข้อมูลขัดแย้งและข้อจำกัดของการตรวจเอกสาร](docs/DOCUMENTATION_AUDIT.md)
- [แนวทางสำหรับผู้ช่วยแก้ repository](AGENTS.md)

## โครงสร้างและเทคโนโลยีปัจจุบัน

| ตำแหน่ง | หน้าที่และหลักฐาน |
|---|---|
| frontend/ | React 19, TypeScript, Vite, React Router; scripts ใน [package.json](frontend/package.json); routes ใน [App.tsx](frontend/src/App.tsx) |
| backend/ | Express 5 + TypeScript, Prisma + PostgreSQL adapter; API entry [src/index.ts](backend/src/index.ts) |
| backend/prisma/ | [schema](backend/prisma/schema.prisma) และ migrations ที่มีอยู่; connection configuration อยู่ [prisma.config.ts](backend/prisma.config.ts) |
| backend/tests/ | Node tests, database/HTTP suites และ Chrome browser harnesses; ไม่ใช่ทุกไฟล์จะปลอดภัยสำหรับรันกับ environment ปัจจุบัน |
| frontend/scripts/ | สร้าง OCR assets จาก dependencies และโมเดลที่ pin checksum |
| docker-compose.yml | PostgreSQL 16 เท่านั้น ไม่ได้เปิด backend/frontend ให้ด้วย |
| package.json ที่ root | dependencies เท่านั้น ไม่มี scripts สำหรับ dev/build/test รวมทั้งระบบ |

หมายเลขรุ่นข้างต้นอ้าง dependency declarations ไม่ใช่ผลตรวจ dependencies ที่ติดตั้งล่าสุด ให้ใช้ lockfile ของแต่ละโฟลเดอร์เมื่อเตรียม dependencies

## เปิดระบบ local ที่ตั้งค่าไว้แล้ว

ทำตาม [DEVELOPMENT.md](docs/DEVELOPMENT.md) ก่อนหากเพิ่ง clone: ต้องมี dependencies, Prisma client, environment และฐานที่เตรียม schema แล้ว การเปิด dev ไม่ deploy migrations อัตโนมัติ

ตรวจ Docker และ process ที่พอร์ต 4000/5173 ก่อน ห้ามเปิด server ซ้ำ

จาก root:

~~~powershell
docker ps
~~~

หาก Docker engine พร้อมและยังไม่มี SpendSense-db ทำงาน ให้ตรวจ container ที่หยุดอยู่และ configuration ก่อนใช้คำสั่งเดิม:

~~~powershell
docker compose up -d
~~~

จาก backend (terminal แรก):

~~~powershell
npm run dev
~~~

จาก frontend หลัง backend เริ่มทำงานแล้ว (terminal ที่สอง) ครั้งแรกหลัง clone หรือ `npm ci` ให้เตรียมไฟล์ OCR ก่อน เพราะ `frontend/public/ocr/` ไม่อยู่ใน Git (คัดลอกจาก node_modules และดาวน์โหลดโมเดลไทย/อังกฤษตาม checksum ใน `scripts/ocr-models.json` ถ้าไม่เตรียม การอ่านสลิปจะใช้ไม่ได้):

~~~powershell
npm run ocr:assets
npm run dev
~~~

บน PowerShell ใช้ npm.cmd แทน npm ได้เมื่อ execution policy ขัดขวาง npm.ps1

- Backend ใช้ PORT หรือ 4000 และ bind 0.0.0.0 ตาม source
- Vite ใช้พอร์ตปกติ 5173 แต่คำสั่ง dev เปล่าไม่ได้บังคับ strictPort: อ่าน URL จาก output จริง
- Development API ใช้ /api ผ่าน Vite proxy ไป http://127.0.0.1:4000
- Compose map host 5433 → container 5432, container SpendSense-db, database SpendSense, configured role SpendSense_user; ไม่ใช่หลักฐานว่า volume เดิมมี credential ตรงกับ configuration ปัจจุบัน

## พฤติกรรมสำคัญที่มีใน source

| ส่วน | พฤติกรรมปัจจุบัน | เอกสารรายละเอียด |
|---|---|---|
| Overview / Budget / Goals | สรุปธุรกรรม งบ และแผนออม/บัญชีเงินเป้าหมาย | [Dashboard](DASHBOARD_IMPLEMENTATION.md), [Goals](GOALS_IMPLEMENTATION.md) |
| Forecast | Theta (θ=2) บนยอดรายจ่ายรวมรายวัน (แทน Holt ตั้งแต่ 3 พ.ย. 2026, [เหตุผล](docs/FORECAST_REAL_DATA_BACKTEST.md)) พยากรณ์ 7 วัน ไม่ใช่ผลรวม forecast รายหมวด | [Forecast](FORECAST_IMPLEMENTATION.md) |
| Behavior | readiness 30 รายจ่าย/ระยะข้อมูล 30 วัน inclusive; รูปแบบซ้ำแยกจากยอดเพิ่มเทียบช่วงก่อนและเวลากระจุก | [Behavior](BEHAVIOR_IMPLEMENTATION.md) โดยอ่านหัวข้อ v2 และ revision ล่าสุด |
| Anomaly | มีกฎ/การตัดสินแยกจาก Behavior; collection และ automatic amount matching ปิดใน source | [Dimensions](ANOMALY_DIMENSIONS_IMPLEMENTATION.md), [Retention](ANOMALY_RETENTION_IMPLEMENTATION.md) |
| OCR | Tesseract ไทย/อังกฤษทำงานใน browser ใช้ assets local ที่ต้องเตรียมก่อน | [OCR](OCR_IMPLEMENTATION.md) |
| Password reset | มี implementation แต่ default ปิด; config เปิดใช้ต้องผ่าน validation | [Password reset](PASSWORD_RESET_IMPLEMENTATION.md) |
| Admin / Setup / Settings | มี routes และ guards; การมี UI ไม่ยืนยันว่ามี admin account/config พร้อมใช้งานแล้ว | [Admin](ADMIN_IMPLEMENTATION.md), [Setup](SETUP_IMPLEMENTATION.md), [Settings](SETTINGS_IMPLEMENTATION.md) |

## การตรวจและสถานะ

ไม่มี npm test ใน root/backend/frontend ให้เลือก suite ตาม [คู่มือทดสอบ](docs/DEVELOPMENT.md#การตรวจและทดสอบ) ห้ามใช้ wildcard รัน tests ทั้งหมดกับ DATABASE_URL ที่ไม่ทราบเป้าหมาย

รอบจัดทำเอกสารนี้ตรวจไฟล์และคำสั่งเท่านั้น ไม่ได้รันแอป tests migrations หรือเชื่อมฐานข้อมูลใหม่ ผลทดสอบและ User Acceptance ที่อยู่ใน implementation documents เป็นประวัติของ revision/ขอบเขตนั้น ไม่ใช่สถานะรับรองทั้ง repository ณ ปัจจุบัน
