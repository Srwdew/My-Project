# Settings implementation — 19 กันยายน 2026 (Asia/Bangkok)

## ขอบเขตและแหล่งอ้างอิง

พัฒนาจาก Settings/Profile/Budget/Goals/notification/auth ที่มีอยู่ ไม่สร้าง Transaction หรือ Goal จากข้อมูลวางแผน ใช้ AppLayout, Sidebar, UserHeader และ NotificationBell เดิม ไม่มี dependency ใหม่ของแอป โดยปิดงานเฉพาะ Settings และไม่ push

ใช้ภาพ docs/mockups/User-settings.png ซึ่งเปลี่ยนชื่อจากภาพเดิมตามคำขอและตรงกับ 4 ส่วนที่ระบุ ไม่วาดกรอบแดงหรือเลข annotation และไม่ใช้ข้อมูลบุคคล/ตัวเลขในภาพเป็นข้อมูลจริง

## สิ่งที่ทำจริง

- หน้า Settings: ข้อมูลบัญชี, ข้อมูลวางแผนการเงิน, แจ้งเตือน, ความปลอดภัย; desktop grid สองคอลัมน์/mobile หนึ่งคอลัมน์; footer อยู่ใน document flow
- ชื่อแก้ผ่าน persistence/validation ร่วมกับ Profile API เดิม อีเมล read-only; บันทึกแล้ว reload ProfileContext และ UserHeader
- Cancel เรียก GET /settings ใหม่ ไม่ย้อนกลับไป cache เก่า; session key แยก subtree, abort/validity guard ป้องกัน response เก่าทับบัญชีใหม่
- avatar เก็บ Prisma Bytes/PostgreSQL bytea จำกัด 1 MB ตรวจ MIME และ signature ของ JPEG/PNG/WebP ไม่รับ SVG; authenticated Blob URL ถูก revoke เมื่อเปลี่ยนรูป/session/unmount รูปบันทึกทันทีแยกจากปุ่มบันทึกฟอร์ม
- Profile.income เปลี่ยน Float เป็น Decimal(12,2) และ API ส่ง string; ไม่ใช่เงินจริง/Transaction; nullable paydayDay 1–31 พร้อม effectivePaydayDate ที่ clamp สิ้นเดือนตาม Bangkok/UTC surrogate
- งบใช้ Budget เดือนปัจจุบันตาม Asia/Bangkok ไม่มี monthlyBudget ใน Profile; null หมายถึงยังไม่ตั้ง/ยกเลิกงบรวม ไม่ใช่ 0; เดือนเปลี่ยนระหว่างเปิดฟอร์มตอบ 409 ให้โหลดใหม่
- primaryGoalId อ้าง Goal ของบัญชีเดียวกันด้วย composite FK เลือกใหม่ได้เฉพาะไม่ archived; ถ้า primary เดิม archived ยังคง pointer พร้อมแสดงว่าไม่พร้อมใช้ ไม่เลือกใหม่อัตโนมัติ
- Profile.goal เก็บข้อความ legacy ไว้และแสดงคำอธิบาย ยังไม่แปลงเป็น Goal/ยอดเงินจริง แผนถัดไปคือให้ผู้ใช้เลือก Goal เองก่อนพิจารณาย้าย/เลิกใช้ field เดิม ไม่ลบเงียบ ๆ
- notifyNearLimit และ notifyExceeded แยกกัน ใช้ record/producer เดียวกับ Budget; enabled = near OR exceeded; Settings รักษา warningPercent/totalBudget/categoryBudgets เดิม ส่วนฟอร์ม Budget แก้ค่าเหล่านี้ต่อได้
- anomaly และ weekly Goal summary disabled พร้อมคำอธิบาย ไม่มี consumer/preference/notification จำลอง
- เปลี่ยนรหัสและปิดบัญชีแยก dialog ตรวจ bcrypt; token ใหม่มี authVersion และ token เก่าที่ไม่มี version เป็น 0; หลังเปลี่ยนรหัส/ปิดบัญชีเพิ่ม version แล้ว logout
- ปิดบัญชีตั้ง deletedAt และเพิ่ม authVersion ใน transaction เดียว ไม่ hard-delete Transaction หรือ Goal ledger/operation/history
- เตือนก่อน navigation, browser unload/back และ Sidebar logout เมื่อ dirty; native dialog เสริม Tab trap, Escape และคืน focus; ป้องกัน submit ซ้ำด้วย lock

## API

| Endpoint | Contract/พฤติกรรม |
|---|---|
| GET /settings | authenticated snapshot ของ Profile, budgetMonth/amount, goals ที่เลือกได้, primaryGoal รวม archived state, legacy text, notification settings; เงินเป็น string/null |
| PUT /settings | strict full payload: displayName, income, paydayDay, primaryGoalId, budgetMonth, budgetAmount, notifyNearLimit, notifyExceeded; reject unknown fields/userId |
| GET /profile | API เดิมเพิ่ม hasAvatar; ไม่ส่ง binary ใน profile JSON |
| PUT /profile | API ชื่อเดิมใช้ saveProfile/validation ร่วมกับ Settings |
| GET /profile/avatar | รูปของ user จาก auth เท่านั้น; 404 เมื่อไม่มีรูป, private/no-store และ nosniff |
| PUT /profile/avatar | binary request body; Content-Type ต้องตรง signature; >1 MB ตอบ 413, type/signature ผิดตอบ 400 |
| DELETE /profile/avatar | ล้างเฉพาะรูปของ user จาก auth |
| POST /auth/change-password | currentPassword, newPassword, confirmPassword; ความยาวขั้นต่ำ 6 ตาม Register และไม่เกิน bcrypt 72 UTF-8 bytes; revoke sessions/logout |
| POST /auth/close-account | currentPassword และ confirmation เท่ากับ “ปิดบัญชีผู้ใช้”; soft closure/logout |
| GET/PUT /notification-settings/budget | API เดิมเพิ่ม notifyNearLimit; รักษา legacy payload ที่ไม่มี field ใหม่นี้ โดย mapping enabled เป็น near |

PUT /settings ใช้ transaction เดียวและ user row lock protocol เดียวกับ Goals พร้อมตรวจ authVersion ซ้ำหลังล็อก ข้อผิดพลาด validation/ownership/scope ทำให้ rollback ทั้ง Profile/Budget/settings หลัง commit จึงเรียก producer; producer ล้มเหลวไม่เปลี่ยน CRUD สำเร็จเป็นล้มเหลว ใช้ reconciliation ของระบบแจ้งเตือนเดิมได้ ไม่มี durable queue เพิ่ม

## Migration

ชื่อใหม่: `20260919010000_add_user_settings`

- User.authVersion default 0
- Profile.income Decimal(12,2), paydayDay, primaryGoalId, avatarData bytea, avatarMime
- composite FK (userId, primaryGoalId) → Goal(userId,id), index และ CHECK ของเงิน/payday/avatar type-size/null consistency
- BudgetNotificationSetting.notifyNearLimit และ CHECK enabled = near OR exceeded
- mapping preferences เดิม: near = enabled, exceeded = enabled AND notifyExceeded จึงไม่เปิดแจ้งเตือนให้ผู้ที่เคยปิดไว้
- ตรวจ legacy income ก่อน cast; หากมีค่าติดลบ/เกิน precision/ทศนิยมเกินสองตำแหน่ง/nonfinite ให้ migration หยุดเพื่อ review แทนการปัดทิ้งเงียบ ๆ

ตรวจ 9 applied migrations เดิม: SHA-256 ตรงไฟล์ทั้งหมด ทดสอบทั้ง chain 10 migrations บนฐานใหม่แยกก่อน apply เฉพาะ migration ใหม่นี้กับฐาน local จากนั้น migrate status = 10 migrations, up to date ไม่ reset/resolve/db push/seed/แก้ applied migration

ตรวจ fingerprint Transaction, Goal, GoalFundingSource, GoalOperation, GoalLedgerEntry, GoalOpeningRevision, Budget, CategoryBudget และ Notification ก่อน/หลัง apply ตรงกัน ไม่มี financial backfill หรือการลบประวัติ

## ผลที่ AI รันจริง

| ระดับ | ผล |
|---|---|
| Prisma validate/generate | ผ่าน |
| Backend/frontend build | ผ่าน; frontend มีคำเตือน bundle >500 kB เดิม |
| Node HTTP/DB/calculation/regression | 77 tests ผ่าน ไม่มี fail/skip (รวม parent tests) |
| Settings เฉพาะส่วนเพิ่มใน 77 | 10 tests รวม parent: validation/date, defaults/null, atomic rollback, Budget/Profile round-trip, ownership/archived/DB FK, near/exceeded producer, avatar type/signature/size/auth/delete, password/token/login/closure/history preservation |
| Goals regression | 27 tests รวม HTTP/PostgreSQL/หลาย connection ที่ commit จริง |
| Notification/reconciliation regression | 40 tests รวม HTTP double และ PostgreSQL จริง |
| Chrome headless ผ่าน DevTools โดยไม่เพิ่ม dependency | desktop/mobile, long text/money overflow, keyboard switch, save/shared header, Cancel, unsaved navigation/logout, dialog focus trap/Escape/คืน focus, stale session response, Blob URL revoke/logout ผ่าน |
| Migration database | fresh isolated database apply ทั้ง 10 migrations ผ่าน |

Regression fixture เดิมปรับ token ให้มี authVersion ตามผู้ใช้ และแยกรัน tests ฐานข้อมูลตามลำดับ ป้องกัน fixture ปิดบัญชีระหว่างอีกชุดอ่านบัญชีนั้น ไม่ลด assertions เพื่อให้ผ่าน

Browser automation ใช้ API double เพื่อควบคุม session race ไม่ใช่ browser acceptance กับ backend จริง; ส่วน HTTP/database ทดสอบ backend จริงต่างหาก การติดตั้ง Playwright ถูกปฏิเสธ จึงไม่ได้เพิ่ม package และใช้ Chrome ที่มีอยู่ผ่าน DevTools ในตัว

คำสั่งหลัก:
- backend: node tests/runSettingsDatabase.cjs (ต้อง inject DATABASE_URL ที่ชี้ฐาน admin ทดสอบชื่อ spendsense_goals_test_*; runner ปฏิเสธฐานอื่นและสร้างฐานทดสอบใหม่)
- root: node backend/tests/settings.browser.cjs (frontend ที่ 127.0.0.1:5173; override SETTINGS_BROWSER_ORIGIN / SETTINGS_CHROME_PATH ได้)
- backend: Prisma validate/generate และ npm run build; frontend: npm run build

ฐานทดสอบรอบสุดท้าย `spendsense_goals_test_1789798652937_2e6eaf` เก็บไว้ ไม่ drop/reset หลักฐาน logs/screenshots อยู่ .git/settings-verification ไม่ใช่ไฟล์ที่จะ commit รูปใน browser mock สร้างในหน่วยความจำ ไม่มีรูปทดสอบใหม่ใน source tree

## Browser acceptance โดยผู้ใช้ — ผ่าน 19 กันยายน 2026

ผู้ใช้ยืนยันว่าตรวจรับ Settings ผ่านแล้ววันที่ 19 กันยายน 2026 ผลนี้แยกจาก automated tests ของ AI และ Chrome automation ที่ใช้ API double รายการต่อไปนี้เป็นขอบเขต checklist สำหรับการตรวจรับ ไม่ใช่คำอ้างว่า AI ทดสอบเบราว์เซอร์กับ backend จริงครบทั้งหมด

- ใช้บัญชีจริงตรวจ save/Cancel และชื่อ/avatar ใน UserHeader รวม upload JPEG/PNG/WebP ที่ใช้งานจริง
- เปลี่ยนงบจาก Settings แล้วเปิด Budget และทำย้อนกลับ รวม near/exceeded/threshold/scope เดิม
- เลือก Goal แล้ว archive จาก Goals ตรวจข้อความ primary ไม่พร้อมและเลือกใหม่
- ตรวจเปลี่ยนรหัส/ปิดบัญชีบนบัญชีทดสอบเท่านั้น รวม session อีก browser ถูกปฏิเสธและข้อมูลประวัติยังอยู่
- ตรวจ native file chooser, browser Back/Forward/reload, mobile/keyboard และข้อความยาวด้วย browser ที่ผู้ใช้ใช้จริง

## ไฟล์รอบนี้

Backend: prisma/schema.prisma; prisma/migrations/20260919010000_add_user_settings/migration.sql; src/index.ts; src/lib/profile.ts; src/lib/budgetNotifications.ts; src/middleware/auth.ts; src/routes/settings.ts; tests/settings.database.test.ts; tests/settings.browser.cjs; tests/runSettingsDatabase.cjs; tests/budgetNotifications.database.ts; tests/notifications.http.test.ts; tests/reconciliation.database.test.ts

Frontend: src/pages/Settings.tsx; src/pages/Settings.css; src/pages/Budget.tsx; src/contexts/ProfileContext.tsx; src/components/UserHeader.tsx; src/components/Sidebar.tsx; src/auth.ts; src/api.ts; src/utils/useUnsavedSettings.ts

เอกสาร: SETTINGS_IMPLEMENTATION.md และ SpendSense_PROJECT_CONTEXT.md

ไฟล์เดิมที่คงไว้นอกงาน: .env.example, docker-compose.yml local port, root package/lockfile, frontend/src/App.css, seed ตัวอย่าง, component ว่าง 5 ไฟล์ ไม่รวมใน commit Settings; mockup ที่เปลี่ยนชื่อรวมในงานนี้ ไม่ push

ข้อจำกัด: avatar ยังไม่ resize/transcode/strip metadata และไม่ใช้ object storage; goals selector โหลดรายชื่อที่ใช้งานได้ทั้งหมด; ไม่มี anomaly/weekly Goal scheduler และไม่มี durable notification event log ตามระบบเดิม
Applied migration ใช้ .gitattributes เฉพาะโฟลเดอร์กำหนด migration.sql -text ตาม convention ของ Goals เพื่อรักษา exact bytes และตรวจ SHA-256 เทียบฐานข้อมูลและ staged blob ก่อน commit

รอบปิดงาน 19 กันยายน 2026: รันซ้ำ Prisma validate/generate, backend/frontend build ผ่าน; 77 tests ผ่าน ไม่มี fail/skip และ Chrome API-double 11 กลุ่มผ่าน ตรวจ migration status 10 migrations up to date และ checksum applied migrations ทั้ง 10 ตรงไฟล์จริง คำเตือน frontend bundle >500 kB ยังอยู่ แยกจาก browser acceptance ที่ผู้ใช้ยืนยันผ่านในวันเดียวกัน
