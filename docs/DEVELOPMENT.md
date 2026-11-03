# Development and verification guide

ร่างจาก source ที่ตรวจ 21 ตุลาคม 2026 คำสั่งด้านล่างเป็นคำสั่งของ scripts/CLI/test files ที่มีอยู่ ไม่ใช่บันทึกว่ารันผ่านในงานเอกสารนี้

## สิ่งที่ต้องเตรียม

Node.js/npm, Docker engine ที่พร้อมใช้ PostgreSQL 16 และ dependencies ของ backend/frontend ไม่มี engines หรือไฟล์ pin Node version ใน package manifests ที่ตรวจ จึงยังไม่ระบุ supported Node version แทนเจ้าของโครงการ ให้ตรวจข้อกำหนด dependencies ก่อนติดตั้ง

แยก working directory ให้ถูกต้อง ไม่มี root workspace script ที่เปิดทั้งระบบให้

ก่อนรันชุดคำสั่ง backend ด้านล่าง ให้เตรียม `DATABASE_URL` ใน environment ของ backend ให้เรียบร้อย เพราะ [prisma.config.ts](../backend/prisma.config.ts) อ่านค่านี้ผ่าน `dotenv/config` ดูหัวข้อ Environment ด้านล่าง ไม่ใส่ค่าจริงในเอกสารและไม่ถือว่า root `.env` เป็น configuration ของ backend อัตโนมัติ

จาก backend:

~~~powershell
npm ci
npx prisma generate
~~~

จาก frontend:

~~~powershell
npm ci
~~~

npm ci ใช้ lockfile ในแต่ละโฟลเดอร์ Prisma generate เป็นคำสั่งสร้าง client ไม่ใช่ apply migration คำสั่งเหล่านี้เขียน dependencies/generated artifacts และอาจใช้เครือข่าย ไม่ใช่ read-only checks

## Environment — ไม่ใส่ค่าจริงในเอกสาร

| ตัวแปร | ตำแหน่ง/ผู้ใช้ | ความหมายจาก source |
|---|---|---|
| POSTGRES_PASSWORD | root environment สำหรับ Compose | Compose บังคับให้มีค่า; ตั้งค่า local เอง ห้ามคัดลอกค่าจาก local .env.example โดยไม่ตรวจ |
| DATABASE_URL | environment ของ backend; dotenv เมื่อรันจาก backend | ใช้ใน Prisma config และ adapter; local Compose map port 5433 แต่ต้องตรวจ target จริงก่อนเชื่อม |
| JWT_SECRET | backend | ใช้ลงนาม/ตรวจ session token; ไม่มี secret ตัวอย่างที่พร้อมใช้ในคู่มือนี้ |
| PORT | backend | ไม่กำหนดจะใช้ 4000; Vite proxy ยังชี้ 4000 แบบคงที่ |
| VITE_API_URL | frontend build ที่ไม่ใช่ DEV | fallback /api; dev ใช้ /api เสมอ ไม่ใช่ localhost:4000 fallback |
| PASSWORD_RESET_ENABLED | backend | เปิดเฉพาะค่า true; default ปิดและ endpoints ตอบ 503 |

ไม่มี backend/.env.example ที่ tracked ในไฟล์ที่ตรวจ อย่าถือว่า root .env เป็น backend configuration อัตโนมัติ ไม่ได้อ่าน backend/.env หรือ frontend/.env.local ในการตรวจเอกสารนี้

Password reset มี configuration เพิ่มเติม เช่น origin allowlist, limiter key, trusted proxies และ provider ดู [เอกสารเฉพาะ](../PASSWORD_RESET_IMPLEMENTATION.md) และ [factory](../backend/src/routes/passwordReset.ts) อย่าเปิดส่งอีเมลจริงเพียงเพื่อทดสอบหน้าเว็บ

## ฐานข้อมูลและการเปิดระบบ

ตรวจ docker ps ก่อน และเมื่อจำเป็นตรวจตัวที่หยุดด้วย docker ps -a หาก Docker engine ไม่ทำงานให้เปิด Docker Desktop ก่อน ไม่แก้ปัญหาด้วยการลบ volume

Compose กำหนด postgres:16, SpendSense-db, database SpendSense, role SpendSense_user, host 5433 → container 5432 และ named volume SpendSense_pgdata การเปลี่ยน environment ไม่ยืนยันว่าข้อมูล/credential ใน volume เดิมเปลี่ยนแล้ว

การติดตั้ง dependencies, generate client และเปิด dev ไม่สร้าง schema ให้ครบโดยอัตโนมัติ ยังไม่มี npm script รวม bootstrap ฐานหลักที่ตรวจและรับรองไว้ คู่มือนี้จึงไม่สั่ง apply migration หรือ seed ฐานหลักอัตโนมัติ ต้องกำหนดและตรวจ target/ขอบเขตแยกก่อน ทั้ง backend/prisma/seed.ts ที่เป็น untracked และ script ที่ชื่อ test อาจเขียนข้อมูลได้

ตรวจพอร์ตเดิมบน Windows ก่อนเปิด server:

~~~powershell
Get-NetTCPConnection -State Listen -LocalPort 4000,5173 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | Select-Object ProcessId,CommandLine
~~~

เปิด local application ตาม [README](../README.md#เปิดระบบ-local-ที่ตั้งค่าไว้แล้ว) หากต้องบังคับ Vite ใช้ 5173 และไม่เลื่อนไปพอร์ตอื่น ใช้คำสั่งที่ส่ง flags เข้า dev script จาก frontend:

~~~powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
~~~

เมื่อเป็น integration test ให้ใช้ฐานและ backend ของ test runner แทนการเปิด application backend ด้วย configuration ฐานหลัก

## Scripts ที่ประกาศจริง

| Working directory | คำสั่ง | สิ่งที่ทำ |
|---|---|---|
| backend | npm run dev | tsx watch src/index.ts |
| backend | npm run build | tsc; เขียน dist |
| backend | npm start | node dist/index.js; ต้อง build/configure ก่อน |
| frontend | npm run dev | vite |
| frontend | npm run build | tsc -b && vite build; เขียน build artifacts |
| frontend | npm run lint | oxlint; ไม่ใช่ test runner |
| frontend | npm run preview | vite preview; ไม่เทียบเท่า production hosting |
| frontend | npm run ocr:assets | node scripts/prepareOcrAssets.cjs |

OCR setup คัดลอก worker/core จาก node_modules และอ่าน/ดาวน์โหลด Thai/English models ตาม URL/checksum manifest เขียน frontend/public/ocr และเขียน scripts/ocr-models.json เมื่อทำงานสำเร็จ ต้องตรวจ diff หลังรัน ไม่ได้รันในงานเอกสารนี้

## การตรวจและทดสอบ

⚠️ เทสต์ต้องไม่ต่อฐานหลัก: ใช้ตัวรันใน `backend/tests` ซึ่งสร้างฐานแยก ถ้าเห็น `[test guard]` แปลว่าการต่อฐานถูกบล็อกเพราะ DATABASE_URL ไม่ใช่ฐานทดสอบ อย่าแก้ `.env` เพื่อให้ผ่าน (ISSUE-TEST-3 ใน [DECISIONS](DECISIONS.md))

จาก root หรือ `backend/`: `npm test` (unit + db), `npm run test:unit`, `npm run test:db`, `npm run test:browser`, `npm run test:all` ต้องมี Docker สำหรับ db และ Chrome + พอร์ต 4000 ว่างสำหรับ browser ถ้าขาดจะรายงาน SKIP พร้อมเหตุผลและ exit code ไม่เป็น 0 ไฟล์เทสต์ใหม่ต้องเพิ่มกลุ่มใน `backend/tests/runAll.cjs` ไม่เช่นนั้นนับเป็นล้ม harness browser รันตรงไม่ได้แล้ว ต้องผ่าน `test:browser` ผลล่าสุดดู ISSUE-TEST-4 ใน [DECISIONS](DECISIONS.md)

backend build ไม่ครอบคลุม tests เพราะ tsconfig include เฉพาะ src/**/*.ts

| Working directory | คำสั่งที่มีหลักฐานใช้ | ขอบเขต/ผลข้างเคียง |
|---|---|---|
| root | git diff --check | ตรวจ whitespace ของ unstaged diff ไม่ยืนยันพฤติกรรมระบบ |
| backend | node node_modules/typescript/bin/tsc --noEmit | ตรวจ backend TypeScript ไม่ emit |
| frontend | node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit | ตรวจ app TypeScript |
| frontend | node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit | ตรวจ Vite config TypeScript |
| backend | node --import tsx --test tests/behavior.test.ts | Behavior pure synthetic tests; ไม่เปิด application API/DB |
| backend | node tests/runBehaviorV2.cjs | สร้าง PostgreSQL container ใหม่, verify database, ปิด dotenv/collection, apply migrations เดิมเฉพาะฐานนั้น แล้วรัน unit/database suites; คงทรัพยากรทดสอบไว้ |

Browser Behavior ใช้ [behavior.browser.cjs](../backend/tests/behavior.browser.cjs): ต้อง build backend ก่อนเพราะอ่าน dist/lib, มี frontend server และ Chrome ที่ harness หาได้ ใช้ profile ชั่วคราว/API mocks รวม /api และ /auth/me ไม่ใช่ browser acceptance กับฐานจริง ตัวอย่าง PowerShell จาก backend:

~~~powershell
npm run build
$env:SETTINGS_BROWSER_ORIGIN='http://127.0.0.1:5173'
node tests/behavior.browser.cjs
~~~

อ่าน harness/runner ล่าสุดก่อนรันเสมอ อย่าขยายคำสั่งเป็น tests/*.test.ts เพราะมี database suites และบางไฟล์ที่ไม่ได้ลงท้าย .database.test.ts ก็ใช้ฐานข้อมูล เช่น experimentRetention.test.ts และ notifications.http.test.ts

การมี runner หนึ่งที่ปลอดภัยไม่ยืนยันว่า runners อื่นปลอดภัยเหมือนกัน ไม่รัน migration/reset/seed/cleanup โดยอาศัยชื่อไฟล์เพียงอย่างเดียว

## หลักฐานผลตรวจ

งานเอกสารนี้ไม่ได้รันคำสั่งติดตั้ง/build/test ข้างต้น และไม่ได้ตรวจสถานะ migrations ในฐานใด ผล 54 tests และ browser 13 กลุ่มที่บันทึกใน [Behavior revision 21 October](../BEHAVIOR_IMPLEMENTATION.md) มาจากงานก่อนหน้า ไม่ใช่ผลใหม่ในงานนี้ และไม่รับรองทุกโมดูล
