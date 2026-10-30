# SpendSense repository instructions

ร่างปรับปรุงเมื่อ 21 ตุลาคม 2026 ข้อกำหนดเฉพาะงานจากผู้ใช้มีลำดับเหนือแนวทางในไฟล์นี้ การรับร่างเอกสารหรืออนุญาตให้แก้ Markdown ไม่เท่ากับอนุมัตินโยบายใหม่ทั้งหมด แนวทางที่เสนอด้านล่างยังไม่ใช่ข้อบังคับที่ผู้ใช้ยืนยัน

## กฎที่ผู้ใช้ยืนยันแล้ว

อ้างคำสั่งผู้ใช้ในบทสนทนาและคำแนะนำ local development เดิม ใช้ตามขอบเขตงานที่ได้รับอนุญาต ไม่ขยายสิทธิ์ไปงานอื่นโดยอัตโนมัติ

- ตรวจ repository/source/tests และ git status/diff ก่อนทำงาน รักษา local changes และไฟล์ untracked เดิม ห้าม reset, stash หรือทิ้งงาน
- งานเอกสารนี้แก้ได้เฉพาะ Markdown ห้ามแก้ source/schema/migration, stage/commit/push หรือรัน tests/build
- อ้างคำสั่งและผลตรวจที่มีจริง แยกพฤติกรรมปัจจุบัน ข้อกำหนดที่ยืนยัน และ pending; พบข้อมูลขัดแย้งให้รายงานก่อน ห้ามถือว่าโค้ดเป็นข้อกำหนดที่อนุมัติโดยอัตโนมัติ
- งานตรวจ/ปรับ Behavior ใช้ข้อมูลสังเคราะห์หรือฐานทดสอบแยก ไม่แตะฐานหลักหรือข้อมูลผู้ใช้จริง และไม่เพิ่ม schema/migration
- Behavior คงข้อค้นพบหลัก 8 กรณี (เพิ่มหมวดสัดส่วนสูง 26 ต.ค. 2026) และเกณฑ์ที่ยืนยันใน [DECISIONS](docs/DECISIONS.md); ลดการ์ดตามรายเดือน > รายสัปดาห์ > ทั่วไป เฉพาะหลักฐานซ้ำซ้อน และคงรูปแบบอิสระ
- ไม่ใช้ recurrence thresholds ของ Anomaly ทับ Behavior ไม่เปิด collection หรือ automatic amount-pattern matching; helper ร่วมต้องตรวจความหมายก่อนใช้
- amount tolerance (10% จาก median), date tolerance (รายสัปดาห์ ±1 วัน, รายเดือน ±3 วัน) และขั้นต่ำการเพิ่ม (>=5% และ >=100 บาท) ของ Behavior ผู้ใช้ยืนยันแล้ว 24 ต.ค. 2026 ดู [DECISIONS](docs/DECISIONS.md); ห้ามเปลี่ยนค่าโดยไม่ได้ยืนยันใหม่ ผล tests หรือการรับเอกสารไม่เปลี่ยนสถานะ User Acceptance
- คงเหตุผลระดับหมวด แยกข้อมูลไม่พอกับตรวจแล้วไม่พบ ไม่อ้างนัยสำคัญจากยอดเพิ่มเล็กน้อย ยอดลดเป็นข้อเท็จจริง และข้อสังเกตเวลาเป็นการกระจุกตัว
- ห้ามนำ secrets, credentials, dumps/backups, ข้อมูลทดสอบส่วนตัว, node_modules, dist หรือไฟล์ชั่วคราวเข้า Git
- ห้าม Docker volume reset, docker compose down -v, Prisma migrate reset หรือคำสั่งลบฐานข้อมูลโดยไม่ได้รับอนุญาต
- งานปรับเอกสารนี้ต้องตรวจลิงก์และ git diff --check สรุปเฉพาะ diff เอกสารและรายงานหาก source เปลี่ยนระหว่างงาน

### การเปิด local ตามคำแนะนำเดิมของผู้ใช้

เมื่ออยู่ในงานเปิดระบบที่ผู้ใช้อนุญาต:
1. ตรวจ Docker ด้วย `docker ps`
2. หากไม่มี container `SpendSense-db` ให้ใช้ `docker compose up -d` จาก root
3. ตรวจว่า backend ใช้งานได้ก่อน โดยรัน `npm run dev` จาก backend
4. รัน `npm run dev` จาก frontend
5. ถ้าพอร์ต 4000/5173 ถูกใช้ ให้ตรวจ process เดิมก่อน ห้ามเปิด dev server ซ้ำโดยไม่จำเป็น

ขั้นตอนเปิดระบบไม่ใช่สิทธิ์ให้เปิดหรือเชื่อมฐานหลักในงานที่ห้ามแตะฐานหลัก งานเอกสารปัจจุบันไม่รันระบบ/tests/build

## แนวทางเสนอใหม่ — ยังไม่ใช่นโยบายที่ผู้ใช้อนุมัติทั้งหมด

ใช้เป็นข้อเสนอประกอบการวางแผนภายในขอบเขตที่ได้รับอนุญาต หากต้องการยกระดับเป็นกฎถาวรต้องมีการยืนยันแยก ห้ามใช้หัวข้อนี้ขยายสิทธิ์หรือเปลี่ยนข้อกำหนดผู้ใช้

### การอ่าน repository และเปิดระบบ

- ใช้ [README](README.md), [DEVELOPMENT](docs/DEVELOPMENT.md), [DECISIONS](docs/DECISIONS.md) และ [AUDIT](docs/DOCUMENTATION_AUDIT.md) เป็นแผนที่ แล้วตรวจ source ล่าสุด
- ตรวจ container ที่หยุดอยู่ด้วยก่อนเปิด local; รายงาน URL/พอร์ตตาม output จริง ไม่ถือว่า server listen ยืนยัน schema/migrations ครบ
- แยกขั้นตอนเปิด local application ออกจาก pure unit tests และ runner ที่ใช้ฐานแยก/API mocks ไม่กำหนดให้ทุก suite ใช้ขั้นตอนเดียวกัน

### การทดสอบ ข้อมูล และรายงาน

- ก่อน integration/browser tests อ่าน runner และตรวจ Docker/process ตามที่ suite ต้องใช้ ตรวจ target host/database และวิธีจัดการ dotenv/collection ก่อนรัน
- สำหรับงานในอนาคต เสนอให้ใช้ synthetic fixtures/ฐานแยกเป็นค่าเริ่มต้น โดยยังต้องตรวจขอบเขตผู้ใช้แต่ละงาน ไม่ยกข้อจำกัดเฉพาะงาน Behavior เป็นนโยบายอนุมัติทุกโมดูลโดยอัตโนมัติ
- ไม่อ่าน .env, credentials หรือ private acceptance files เพียงเพื่อจัดทำเอกสาร รายงานชื่อ variable โดยไม่เผยค่า
- แยก pure unit tests, API mocks, isolated database tests และ User Acceptance ในรายงาน การมี migration file ไม่ใช่สิทธิ์ deploy ไปฐานหลัก
- วันที่ไม่มีรายการไม่ใช่หลักฐานว่าไม่มีการใช้จ่ายจริง และ readiness ไม่ใช่การรับรองนัยสำคัญทางสถิติ

## ข้อเท็จจริงจาก configuration ปัจจุบัน — ไม่ใช่ข้อกำหนดที่อนุมัติ

Compose map host 5433 → PostgreSQL 5432 ส่วน backend default 4000 และ Vite dev proxy ชี้ 4000 ถ้าเปลี่ยน PORT ควรตรวจ proxy ด้วย ดู [DEVELOPMENT](docs/DEVELOPMENT.md) ข้อมูลนี้ไม่ยืนยัน credential หรือสถานะฐานใน volume เดิม
