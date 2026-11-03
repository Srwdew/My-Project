# ก่อนรันเทสต์

⚠️ เทสต์ต้องไม่ต่อฐานหลัก ใช้ `npm test`, `npm run test:browser` หรือ `npm run test:all` ซึ่งสร้างฐานแยกและลบเสมอ

ถ้าเห็น `[test guard]` แปลว่าการต่อฐานถูกบล็อกเพราะ `DATABASE_URL` ไม่ใช่ฐานทดสอบ อย่าแก้ `.env` เพื่อให้ผ่าน

รายละเอียดและข้อจำกัด: ISSUE-TEST-3 ใน [DECISIONS](../../docs/DECISIONS.md)
