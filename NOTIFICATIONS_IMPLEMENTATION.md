# ผลพัฒนาการแจ้งเตือนงบ — 16 กันยายน 2026

ผู้ใช้ยืนยันว่าการตรวจรับบนเบราว์เซอร์ผ่านแล้วในการเตรียม commit รอบนี้ (เป็นผลที่ผู้ใช้รายงาน ไม่ใช่ AI รัน browser automation) รายการตรวจรับด้านล่างเก็บไว้เป็นขั้นตอนอ้างอิง ส่วนการทดสอบ concurrent แบบ commit จริงทั้งคู่ยังไม่มีผลยืนยันแยกต่างหาก

## สรุป diff เฉพาะงานรอบนี้

- `backend/src/lib/budgetNotifications.ts` (ใหม่): อ่านงบและยอด expense จริงด้วย Decimal; ตรวจเดือนตาม Asia/Bangkok และวันที่ transaction แบบ UTC surrogate; eventKey คงที่ตามเดือน/ขอบเขต/ประเภท; ใช้ unique userId/eventKey เดิมร่วมกับ PostgreSQL advisory transaction lock ต่อบัญชี; บันทึกข้อความเป็น snapshot
- `backend/src/index.ts`: เรียกตรวจหลังเพิ่ม/แก้/ลบธุรกรรม (แก้วันที่ตรวจเดือนเก่าและใหม่), เปลี่ยนงบรวม/หมวด/ยกเลิกงบหมวด และบันทึก settings; เพิ่ม `POST /notifications/reconcile`; export app เพื่อทดสอบ HTTP โดยยังเริ่ม server ตามคำสั่งเดิม
- `frontend/src/components/NotificationBell.tsx` (ใหม่), `UserHeader.tsx`, `UserHeader.css`: กระดิ่งอ่าน API ล่าสุด 30 รายการ, unread ทั้งหมด, อ่านรายรายการ/ทั้งหมด, โหลด/ข้อผิดพลาด/ลองใหม่, native dialog, ลิงก์ภายใน, polling 60 วินาทีเมื่อหน้าแสดงอยู่; abort request/cleanup และแยก state ตาม session
- `frontend/src/pages/Budget.tsx`: อ่านและเปลี่ยนเดือนด้วย query `month=YYYY-MM` รวมการนำทางไปเดือนอื่นขณะอยู่หน้า Budget แล้ว; ใช้ฟอร์ม settings เดิม
- `frontend/src/api.ts`, `auth.ts`: แจ้ง event หลัง mutation สำเร็จและเมื่อเปลี่ยน session เพื่อ refresh กระดิ่งและล้าง state เก่า
- `backend/tests/budgetNotifications.test.ts`, `notifications.http.test.ts`, `budgetNotifications.database.ts` (ใหม่): ทดสอบ service, HTTP และฐานข้อมูลจริงแบบ rollback
- ไม่แก้ schema, applied migration, package dependency หรือข้อมูลเดิมในฐานข้อมูล งานเดิมใน git มีทั้ง modified/untracked อยู่ก่อนแล้ว จึงไม่ใช้ diff รวมจาก HEAD เป็นสถิติของงานรอบนี้

## พฤติกรรม

- บันทึก settings แล้วตรวจเดือนปัจจุบันทันที; disabled ไม่สร้างข้อความใหม่
- near เมื่อยอดถึง warningPercent; exceeded เฉพาะยอดมากกว่างบ เท่ากับงบยังไม่เกิน
- เกินทันทีและเปิด notifyExceeded สร้างเฉพาะ exceeded; หากปิดยังสร้าง near ตามเกณฑ์ได้ แต่ข้อความระบุยอดเกินจริง
- เคย exceeded ในบัญชี/เดือน/ขอบเขตนั้นแล้ว จะไม่สร้าง near ภายหลัง
- แก้งบ/threshold, ยอดลดแล้วเพิ่ม หรือยกเลิกและสร้างงบหมวดใหม่ ไม่รีเซ็ต eventKey
- ข้อความเก่าไม่แก้ยอดตามข้อมูลปัจจุบัน
- ความล้มเหลวจาก producer ถูกจับแยกจาก CRUD: บันทึกสำเร็จยังตอบสำเร็จ และบันทึก log ให้ตรวจสอบ
- GET /notifications ยังอ่านอย่างเดียว; POST /notifications/reconcile ตรวจงบที่ยังมีทุกเดือนและเดือนปัจจุบันใหม่ กระดิ่งเรียกเมื่อ mount/เปิด/กดตรวจงบและโหลดใหม่
- reconcile อาจสร้างแจ้งเตือนของงบเดือนเก่าที่ยังเข้าเกณฑ์และไม่เคยมีข้อความ จึงเป็นการตรวจจากยอด ณ เวลาปัจจุบัน ไม่ใช่ replay ทุกเหตุการณ์ในอดีต
- ไม่มี queue หรือ durable event log: ถ้ายอดเคยเข้าเกณฑ์ระหว่างระบบล้มแล้วถูกแก้กลับก่อน reconcile หรือยกเลิกงบไปแล้ว จะกู้เหตุการณ์ชั่วคราวนั้นไม่ได้

## ผลที่ AI รันทดสอบจริง

1. Build ก่อนและหลังแก้: backend/frontend ผ่าน
2. `node --import tsx --test tests/budgetNotifications.test.ts tests/notifications.http.test.ts`: ผ่าน 22 tests (รวม parent test); HTTP ใช้ Express/auth/validation จริง แต่ใช้ Prisma double
3. ครอบคลุม 79.99/80/100/100.01 ของงบ 100, threshold 100, Decimal 0.07+0.01, Bangkok เปลี่ยนเดือน, disabled/ขอบเขต, immutable snapshot, แยกบัญชี/หมวด/เดือน/type, กันซ้ำและไม่สร้าง near หลัง exceeded
4. HTTP ยืนยัน settings default/validation/บันทึกแล้ว GET กลับ/ปลอม userId ไม่ได้; เปลี่ยนวันที่ตรวจเดือนเก่าและใหม่; งบรวม/รายหมวด/ยกเลิกงบเรียกตรวจ; ไม่รับวันอนาคต; producer ล้มแล้ว create ยังตอบ 201; reconcile ล้มตอบ 503 แยกต่างหาก; ล่าสุด 30 แต่ unread นับครบ 42; อ่านข้ามบัญชีไม่ได้และเก็บเวลาอ่านแรก
5. `node --import tsx tests/budgetNotifications.database.ts`: ผ่านกับ PostgreSQL จริง — settings upsert/read, producer, boundary/deduplication, การแยกบัญชี/การอ่าน, เวลาอ่านครั้งแรก; ทุกการเขียนอยู่ใน transaction แล้ว rollback ไม่มีข้อมูลทดสอบตกค้าง
6. PostgreSQL สอง transaction จริง: advisory lock และ unique-index contention บล็อกคำขอที่สองจน transaction แรก rollback; ตรวจไม่มี notification ทดสอบค้างหลังจบ **ยังไม่ใช่การจำลองสองคำขอที่ commit ทั้งคู่**
7. Docker ตรวจช่วงแรกไม่พร้อม แต่ตรวจช่วงท้ายพบ `SpendSense-db` ทำงานแล้ว; backend เดิมพอร์ต 4000 ตอบ `/categories` HTTP 200 และไม่ได้เปิดซ้ำ; เปิด frontend dev ที่ `http://127.0.0.1:5173/`

## ขั้นตอนตรวจรับอ้างอิง — ผู้ใช้ยืนยัน browser acceptance ผ่านแล้ว

การทดสอบ DB ข้างต้นยืนยันการบันทึก/อ่านใน transaction และ rollback ไม่ใช่ผลยืนยันว่าฟอร์มบันทึกแล้วปิด browser/เปิดใหม่ยังอยู่ และยังไม่ได้ automate เบราว์เซอร์

ใช้บัญชีทดสอบและเดือน/ขอบเขตที่ยังไม่มี event เดิม เพื่อไม่สับสนกับสิทธิ์เตือนที่ใช้ไปแล้ว:

1. Budget → ตั้งค่าแจ้งเตือน → เปิด, 80%, บันทึก → ปิด/เปิดฟอร์ม → refresh และเข้าใหม่ ค่าต้องเดิม
2. ตั้งงบ 100 และยอด 79.99 → ไม่มี; เพิ่มให้รวม 80 → near หนึ่งข้อความ; รวม 100 → ไม่มี exceeded; รวม 100.01 → exceeded หนึ่งข้อความ
3. ขอบเขตใหม่ที่เกินทันที → เฉพาะ exceeded; ขอบเขตใหม่อีกอันปิด notifyExceeded → near พร้อมข้อความยอดเกินจริง
4. ลด/เพิ่มยอด เปลี่ยนงบ/threshold ตรวจใหม่หลายครั้ง → ไม่ซ้ำ; เคย exceeded แล้วต้องไม่สร้าง near ย้อนหลัง
5. ย้ายธุรกรรมระหว่างสองเดือนและเปลี่ยนหมวด → ตรวจยอดทั้งเดือนเดิม/ใหม่; คลิกข้อความเก่าต้องเปิดเดือนนั้นแม้อยู่หน้า Budget อยู่แล้ว
6. อ่านหนึ่งรายการ/ทั้งหมด, refresh, สลับสองบัญชีและ logout ระหว่าง request → badge และรายการถูกต้อง ไม่มีข้อมูลบัญชีเดิมค้าง
7. ใช้ Tab/Enter/Escape เปิดและปิดกระดิ่ง, ตรวจ focus และ layout บนมือถือ
8. สอง request พร้อมกันที่ commit จริงในบัญชีทดสอบ → เหลือหนึ่งข้อความต่อ eventKey; จากนั้นลองลดกลับเข้า near และตรวจซ้ำ ต้องไม่เกิด near ถ้าเคย exceeded

## คำสั่งรันทดสอบซ้ำ (PowerShell)

จากโฟลเดอร์ `backend`:

```powershell
npm.cmd run build
node --import tsx --test tests/budgetNotifications.test.ts tests/notifications.http.test.ts
node --import tsx tests/budgetNotifications.database.ts
```

จากโฟลเดอร์ `frontend`:

```powershell
npm.cmd run build
```

ไม่ต้องรัน migrate/reset/seed เพื่อใช้การเปลี่ยนแปลงนี้
