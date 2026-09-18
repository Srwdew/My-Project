# SpendSense local development

ก่อนทดสอบระบบ:
1. ตรวจสถานะ Docker ด้วย `docker ps`
2. หากไม่มีคอนเทนเนอร์ `SpendSense-db` ให้รันจากโฟลเดอร์หลัก:
   `docker compose up -d`
3. ตรวจว่า Backend ใช้งานได้ก่อน โดยรันจาก `backend`:
   `npm run dev`
4. รัน Frontend จาก `frontend`:
   `npm run dev`

ห้ามรัน Docker volume reset, `docker compose down -v`,
Prisma migrate reset หรือคำสั่งลบฐานข้อมูลโดยไม่ได้รับอนุญาต

หากพอร์ต 4000 หรือ 5173 ถูกใช้งาน ให้ตรวจ process เดิมก่อน
ห้ามเปิด dev server ซ้ำโดยไม่จำเป็น