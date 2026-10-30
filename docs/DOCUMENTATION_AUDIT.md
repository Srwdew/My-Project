# Documentation audit — 21 October 2026

ตรวจ repository แบบอ่าน source/tests/เอกสาร ไม่อ่านฐานหรือข้อมูลผู้ใช้จริง และไม่รันแอป/build/tests/migrations ในงานนี้ ร่างเอกสารจาก working tree ที่มี local changes เดิม ไม่ใช่การรับรองทุกไฟล์ใน repository

## ข้อมูลขัดแย้งที่รายงานก่อนเขียนร่าง

| หลักฐานเดิม | หลักฐานปัจจุบัน | วิธีจัดการในร่าง |
|---|---|---|
| SpendSense_PROJECT_CONTEXT.md กล่าวถึง API fallback localhost:4000 | frontend/src/api.ts ใช้ /api ใน DEV และ VITE_API_URL หรือ /api เมื่อไม่ใช่DEV; vite.config.tsมีproxy | README/DEVELOPMENTอธิบายตามsource; คงcontextเดิมเป็นประวัติ |
| Context มี Forecast รายหมวด/partial และ Behavior recurrenceรุ่นเก่า >=3วัน | expenseForecast.ts/FORECAST_IMPLEMENTATION.md เป็นtotal-only; behaviorRules.tsกำหนดgeneral5/weekly4/monthly3 | ระบุsourceปัจจุบันและหัวข้อsupersedingในimplementation docs |
| BEHAVIOR_IMPLEMENTATION.mdช่วงต้นยังอธิบายv1และcoexistenceแบบเก่า | หัวข้อv2และ21 October revisionรวมการลดการ์ดซ้ำตรงกับworking tree | ไม่ลบผล/บันทึกประวัติ ให้อ่านrevisionล่าสุดเพื่อพฤติกรรมปัจจุบัน |
| AGENTS.mdเดิมสั่งเปิดฐานlocal/backendก่อนทดสอบทุกกรณี | งานล่าสุดกำหนดsynthetic/ฐานแยก และrunBehaviorV2.cjsสร้างtargetของตนเอง | แยกlocal application startupออกจากpure/unit/integration/browser testing |
| frontend/README.mdเป็นReact/Vite template | frontendมีroutes/API/OCRและscriptsเฉพาะSpendSense | แทนtemplateด้วยทางเข้าคู่มือหลัก ไม่เพิ่มconfiguration |
| .env.exampleบอกว่าควรเป็นค่าว่าง แต่local versionมีPOSTGRES_PASSWORDไม่ว่าง | ตรวจเฉพาะbooleanว่ามีค่าหรือไม่ ไม่แสดงค่า | รายงานและห้ามcopyโดยไม่ตรวจ; ไม่แก้env/configในงานเอกสาร |
| Context ระบุว่าไม่ได้บันทึกroleจริง | docker-compose.ymlกำหนดPOSTGRES_USER=SpendSense_user | ระบุเป็นconfigured roleเท่านั้น ไม่ยืนยันcredentialในvolumeเดิม |

ไม่มีroot READMEก่อนงานนี้ และไม่มีtest scriptในroot/backend/frontend package.json เป็นช่องว่างเอกสาร ไม่ใช่เหตุให้แต่งnpm testขึ้น

## ขอบเขตเอกสารที่ร่าง

- README.md: ทางเข้าระบบ โครงสร้าง การเปิดlocalที่เตรียมไว้แล้ว และลิงก์หลักฐาน
- AGENTS.md: ขอบเขตงาน/local changes/ข้อมูล/การทดสอบและกฎpending
- frontend/README.md: แทนtemplateด้วยลิงก์และพฤติกรรมAPIจริง
- docs/DEVELOPMENT.md: คำสั่งพร้อมworking directoryและผลข้างเคียง
- docs/DECISIONS.md: แยกcurrent/confirmed/pendingโดยไม่ยกทุกค่าจากsourceเป็นapproved
- เอกสารนี้: conflict registerและขอบเขตความเชื่อมั่น

ไม่เขียนทับimplementation documentsหรือSpendSense_PROJECT_CONTEXT.mdที่เป็นประวัติ และไม่แก้local Behavior source/tests/docsที่มีอยู่ก่อนเริ่มงาน

## ผลตรวจและข้อจำกัด

- ผล54tests/13browser groupsในBehaviorเป็นบันทึกงานก่อนหน้า ไม่ใช่ผลรันในงานเอกสารนี้
- ไม่ตรวจcredentials, actual database schema, deployment, email provider, private acceptance artifacts หรือข้อมูลผู้ใช้
- ไม่ยืนยันว่าเอกสารประวัติทุกฉบับถูกต้องทุกประโยค; ตัดสินข้อขัดแย้งเฉพาะที่ตรวจและรายงานไว้
- ไม่มีการติดตั้งdependencyหรือรันคำสั่งruntimeเพื่อพิสูจน์recipeในรอบนี้; อ้างpackage scripts, config, runnersและคำสั่งที่มีหลักฐานใช้อยู่
- ร่างเหล่านี้ยังไม่ใช่การอนุมัติpending policyหรือproduction rollout ไม่stage/commit/push


## บันทึกรอบก่อน — Unexpected working-tree changes during documentation

ระหว่างตรวจร่างพบ non-Markdown fingerprint เปลี่ยน แม้คำสั่งเขียนไฟล์ของงานนี้มีเฉพาะ Markdown 6 ไฟล์ ผู้ใช้ตอบว่าไม่มีงานอื่นที่ทราบ และขอให้รายงานความเปลี่ยนแปลง จึงไม่ระบุสาเหตุ/ผู้แก้ และไม่ revert หรือแก้ source เพื่อให้ checksum กลับมาตรง

- HEAD ที่ตรวจ: 195cf1c; working tree ไม่สะอาดตั้งแต่เริ่มงาน
- ก่อนเขียนร่าง: non-Markdown 304 paths, fingerprint SHA-256 รวม 43a2c143907bf050a8d334ad68b6e9f805c93537c9dd51402f467128eb0e88f5
- ตอนตรวจร่าง: non-Markdown 304 paths, fingerprint SHA-256 รวม 945fa788218809178f34e478c942d69f81e82d742fc4b0491db60a75d619ebbe
- วิธีคำนวณ: รวมชื่อpathเรียงลำดับและraw bytesของ tracked/untracked ที่ Git ไม่ignore ยกเว้นนามสกุล .md; ไม่รวม node_modules/dist ที่ignore ตัวเลขนี้เป็น fingerprint รวม ไม่ใช่สำเนาไฟล์ย้อนหลัง และไม่ยืนยันว่า source ทั้งหมดคงเดิม
- App.tsx/API_URL diff ที่อ่านซ้ำแสดงการจัดรูปแบบ โดย routing API ยังตรงกับคู่มือ; Behavior.tsx ยังมีข้อความpending/สถานะข้อมูลและการแสดงrecurrenceที่อ้างถึง ไม่ได้ตรวจsemantic diffของทุกไฟล์เพิ่มเติม จึงไม่ยืนยันว่าการเปลี่ยนทั้งหมดเป็นformatting
- frontend/src/pages/Behavior.tsx มีlocal changesอยู่ก่อนแล้วและdiffขยายขึ้นระหว่างงาน (ตอนตรวจ 1301 additions/161 deletions เทียบHEAD) ไม่รวมเป็นไฟล์เปลี่ยนใหม่ในรายการต่อไปนี้

ไฟล์non-Markdownที่ปรากฏเป็นmodifiedเพิ่มจากรายการเริ่มงาน (31 paths):

- frontend/src/App.tsx
- frontend/src/api.ts
- frontend/src/index.css
- frontend/src/pageChrome.css
- frontend/src/pages/Addtransaction.css
- frontend/src/pages/Addtransaction.tsx
- frontend/src/pages/Admin.css
- frontend/src/pages/Admin.tsx
- frontend/src/pages/AnomalyDetail.css
- frontend/src/pages/AnomalyDetail.tsx
- frontend/src/pages/AnomalyQueue.css
- frontend/src/pages/AnomalyQueue.tsx
- frontend/src/pages/Behavior.css
- frontend/src/pages/Budget.css
- frontend/src/pages/Budget.tsx
- frontend/src/pages/EditTransaction.css
- frontend/src/pages/EditTransaction.tsx
- frontend/src/pages/Forecast.css
- frontend/src/pages/Forecast.tsx
- frontend/src/pages/Goals.css
- frontend/src/pages/Guide.css
- frontend/src/pages/Guide.tsx
- frontend/src/pages/Login.css
- frontend/src/pages/Login.tsx
- frontend/src/pages/Overview.css
- frontend/src/pages/Overview.tsx
- frontend/src/pages/Register.css
- frontend/src/pages/Register.tsx
- frontend/src/pages/Settings.css
- frontend/src/pages/Setup.css
- frontend/src/pages/TransactionHistory.css

ร่างอ้างsourceที่อ่านและจุดที่ตรวจซ้ำตามขอบเขตข้างต้น ไม่อ้างเป็นsnapshotแช่แข็งของทั้งrepository แนะนำตรวจdiffเหล่านี้ในงานsource reviewแยก ก่อนนำผลทดสอบเก่ามาผูกกับworking treeล่าสุด งานเอกสารนี้ไม่รันtestsซ้ำเพื่อรับรองการแก้ไขที่ไม่ทราบสาเหตุ

## บันทึกรอบก่อน — Documentation checks performed

ตรวจ local link targets 51 ลิงก์ว่ามีไฟล์ปลายทางจริง ตรวจชื่อpackage scriptsจากJSONจริง และตรวจdiff whitespace ไม่พบปัญหาที่รายงานโดยgit diff --check; ไม่ได้ทดสอบruntime recipes การตรวจchecksumพบความเปลี่ยนแปลงดังรายงาน จึงไม่อ้างว่าsourceทั้งtreeคงเดิม ไม่มีstaged diff ณ ตอนตรวจ

## ผล read-only review รอบล่าสุด — 21 ตุลาคม 2026

หัวข้อนี้เป็นผลตรวจภายหลังบันทึกรอบก่อน ไม่แทนที่ประวัติและไม่ใช่ผลรัน tests/build ใหม่ เปรียบเทียบ source กับ HEAD `195cf1c8f8edb0864313646a612c690733a2dae9` และบันทึกการแก้ Behavior ที่ได้รับอนุญาต โดยไม่เชื่อมฐานข้อมูลหรืออ่านข้อมูลผู้ใช้จริง

### Frontend 31 ไฟล์ที่เปลี่ยนเพิ่มเติม

ไม่พบ business logic ที่เปลี่ยนในกลุ่ม 31 ไฟล์ตามรายการรอบก่อน ภายใต้การเปรียบเทียบ source/โครงสร้างที่ normalize ในหน่วยความจำดังนี้ ไม่ใช่ข้อพิสูจน์ว่า runtime ทุกกรณีเหมือนเดิม

พาธในตารางเริ่มจาก `frontend/src/`; ชื่อในกลุ่ม pages ทั้งหมดอยู่ใต้ `pages/`

| กลุ่ม | จำนวน | ไฟล์ | หลักฐานและข้อจำกัด |
|---|---:|---|---|
| Whitespace | 7 | index.css, pageChrome.css; pages: Addtransaction.css, EditTransaction.css, Login.css, Register.css, TransactionHistory.css | ตัด whitespace แล้วตรงกัน และตรวจโครงสร้าง CSS ประกอบ |
| รูปแบบไวยากรณ์ CSS | 11 | pages: Admin.css, AnomalyDetail.css, AnomalyQueue.css, Behavior.css, Budget.css, Forecast.css, Goals.css, Guide.css, Overview.css, Settings.css, Setup.css | เปรียบเทียบโครงสร้าง CSS โดย normalize รูปแบบเลข/quotes/ช่องว่าง; selector, declaration และลำดับกฎตรงกัน |
| รูปแบบ TS/TSX | 9 | App.tsx, api.ts; pages: Addtransaction.tsx, Budget.tsx, EditTransaction.tsx, Guide.tsx, Login.tsx, Overview.tsx, Register.tsx | JavaScript ที่แปลงในหน่วยความจำมีโครงสร้างตรงกันหลัง normalize วงเล็บและ string; ไม่ใช่การ type-check หรือรันแอป |
| การแบ่งข้อความ JSX | 4 | pages: Admin.tsx, AnomalyDetail.tsx, AnomalyQueue.tsx, Forecast.tsx | ข้อความติดกันถูกแบ่งต่างกัน แต่ต่อแล้วเท่ากันและโครงสร้างส่วนอื่นตรงกัน; ขอบเขต text node อาจต่างและกระทบผู้ใช้ DOM ระดับ node |

ไม่มีไฟล์ในกลุ่มนี้ที่เปลี่ยนเฉพาะ CRLF/LF อย่างเดียว จึงไม่เรียกทั้ง 31 ไฟล์ว่า whitespace-only หรือ line-endings-only ความเสี่ยงที่ยังเหลือคือ text-node boundaries และ diff รูปแบบขนาดใหญ่ที่ทำให้ทบทวน logic ยากขึ้น ไม่ได้ทดสอบ browser/runtime เพื่อรับรองผล

### Behavior.tsx ที่มี local changes เดิม

[Behavior.tsx](../frontend/src/pages/Behavior.tsx) แยกจาก 31 ไฟล์ข้างต้น มี diff เทียบ HEAD 1,301 additions / 161 deletions ณ รอบตรวจ ส่วนเปลี่ยนพฤติกรรมตรงกับงานที่อนุญาตก่อนหน้า: แยกข้อมูลไม่พอ/ตรวจแล้วไม่พบ, เพิ่มสถานะรายหมวดและเวลา, อธิบายการลดการ์ดซ้ำและข้อกำหนดร่วม/pending

ประกอบ HEAD กับบันทึกการแก้ที่อนุญาตในหน่วยความจำ แล้ว normalize formatting และข้อความ JSX ที่ติดกัน พบว่าตรงกับไฟล์ที่ตรวจ ไม่พบ logic เพิ่มเติมที่อธิบายไม่ได้ด้วยวิธีนี้ การประกอบดังกล่าวไม่ใช่ byte snapshot ที่เก็บไว้ก่อนเกิดเหตุ อัลกอริทึมลดการ์ดจริงอยู่ใน [behaviorRules.ts](../backend/src/lib/behaviorRules.ts) และ [behavior.ts](../backend/src/lib/behavior.ts)

### หลักฐานย้อนหลังและขอบเขตความเชื่อมั่น

- fingerprint รวม 304 paths สองค่าข้างต้นยืนยันเพียงว่าเนื้อหาบางส่วนเปลี่ยน ไม่สามารถกู้เนื้อหารายไฟล์หรือระบุผู้แก้/เวลาได้
- พบ `.git/spendsense-staged-review.patch` จากช่วงก่อนงาน Behavior จึงไม่ใช่ snapshot ก่อนความเปลี่ยนแปลงระหว่างงานเอกสาร
- ไม่สามารถยืนยันผู้แก้ เครื่องมือ หรือเวลาเกิดการเปลี่ยนแปลง และไม่ใช้เวลาแก้ไฟล์เพียงอย่างเดียวสรุปสาเหตุ
- `git diff --check` ผ่าน ณ รอบ read-only review; ไม่มี staged diff มีคำเตือน LF/CRLF จาก Git
- ไม่รัน tests/build/runtime และไม่ขยายผล 54 tests / 13 browser groups ในประวัติให้รับรอง working tree ล่าสุด
- ข้อกำหนดที่ยืนยันแล้ว, pending และ User Acceptance คงตาม [DECISIONS](DECISIONS.md) การตรวจ source หรือรับร่างเอกสารไม่ใช่การอนุมัตินโยบายใหม่หรือการตรวจรับ Behavior revision ล่าสุด

ผลตรวจเอกสารรอบนี้: README และ frontend/README ใช้อ้างอิงภาพรวมได้; DEVELOPMENT ควรวาง DATABASE_URL ก่อนคำสั่ง generate และระบุการเขียน OCR manifest เมื่อสำเร็จ; AGENTS ต้องแยกกฎที่ผู้ใช้ยืนยันจากแนวทางเสนอใหม่; AUDIT ต้องเก็บผลรอบล่าสุดแยกจากประวัติ การปรับ Markdown ภายหลัง review ทำตามรายการนี้ โดยไม่เปลี่ยน source หรือสถานะ pending/User Acceptance
