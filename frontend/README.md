# SpendSense frontend

React + TypeScript + Vite frontend ของ SpendSense เอกสาร template เดิมถูกแทนด้วยทางเข้าคู่มือของโปรเจกต์

- [README หลัก](../README.md)
- [ติดตั้ง เปิด dev และตรวจระบบ](../docs/DEVELOPMENT.md)
- [ข้อกำหนดและเรื่องที่ยัง pending](../docs/DECISIONS.md)

Scripts จริงใน [package.json](package.json): dev, build, lint, preview และ ocr:assets ไม่มี test script

Development API ใช้ /api ผ่าน [Vite proxy](vite.config.ts) ไป backend พอร์ต 4000 Production ใช้ VITE_API_URL หรือ /api ตาม [api.ts](src/api.ts) ต้องมี hosting/API routing ที่สอดคล้องกัน; Vite preview ไม่ใช่หลักฐานว่าระบบ production พร้อม
