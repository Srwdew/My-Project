# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

บุคคลทั่วไปในไทยที่บันทึกรายรับ/รายจ่ายของตัวเอง ใช้เงินบาทและเวลา Asia/Bangkok งานหลักคือบันทึกให้เร็ว เห็นภาพรวม คุมงบ และวางแผนเป้าหมายการออม ผู้ดูแลระบบ (Admin) เป็นกลุ่มรอง

## Product Purpose

เว็บจัดการการเงินส่วนบุคคล: บันทึกธุรกรรม (รวม OCR ใบเสร็จ), งบประมาณรายเดือน/รายหมวด, เป้าหมายการออม, ภาพรวม, Forecast, Behavior, Anomaly และแจ้งเตือนผ่านกระดิ่งกลาง เป็นโปรเจกต์วิชาการ/จบการศึกษา ความสำเร็จคือผู้ใช้เข้าใจสถานะการเงินของตัวเองและผลวิเคราะห์อธิบายและตรวจสอบย้อนกลับได้ด้วยสูตรและเหตุผลที่เขียนไว้

## Positioning

การวิเคราะห์ที่อธิบายได้และซื่อตรงต่อข้อมูล: ทุกผลของ Behavior/Anomaly/Forecast แสดงเหตุผล แยก "ข้อมูลไม่พอ" ออกจาก "ตรวจแล้วไม่พบ" และไม่อวดนัยสำคัญเกินจริง ร่วมกับการบันทึกที่เร็ว (OCR) และการวางแผน Goals + Budget + Forecast ที่เชื่อมกัน

## Operating Context

- ใช้ภาษาไทยเป็นหลัก UI และเอกสาร
- งานมีเอกสารเชิงวิชาการประกอบ: สูตร ทฤษฎี และแหล่งอ้างอิงจริง (ห้ามแต่งแหล่งอ้างอิง)
- เกณฑ์ที่ผู้ใช้ยืนยันแล้วอยู่ใน [docs/DECISIONS.md](docs/DECISIONS.md)

## Capabilities and Constraints

- Stack เดิม: React 19 + TypeScript + Vite + Tailwind 4 + lucide-react (frontend), Express 5 + Prisma + PostgreSQL (backend)
- Routes ปัจจุบัน: Overview, Transaction History, Add/Edit Transaction, Budget, Goals, Forecast, Behavior, Anomaly (Queue/Detail), Settings, Setup, Guide, Admin, Login/Register/Password Recovery, Public Home
- ข้อความวิเคราะห์ต้องคงเหตุผลระดับหมวด ยอดลดเป็นข้อเท็จจริง ข้อสังเกตเวลาเป็นการกระจุกตัว ไม่อ้างนัยสำคัญจากยอดเพิ่มเล็กน้อย
- วันที่ไม่มีรายการไม่ใช่หลักฐานว่าไม่มีการใช้จ่ายจริง; readiness ไม่ใช่การรับรองนัยสำคัญทางสถิติ

## Brand Commitments

ชื่อ SpendSense มีงานแนวคิดโลโก้ใน `logo-concepts/` และ mockups ใน `docs/mockups/` (ยังไม่ยืนยันว่าเป็นข้อผูกมัด)

## Evidence on Hand

ไม่มี testimonials ลูกค้า หรือตัวเลขการใช้งานจริง ห้ามแต่งขึ้น มีรายงาน backtest ของ Forecast (`FORECAST_BACKTEST_REPORT.md`, `FORECAST_TOTAL_BACKTEST_REPORT.md`) และการทดลอง Anomaly (`ANOMALY_TOLERANCE_EXPERIMENT.md`)

## Product Principles

1. อธิบายได้ก่อนฉลาด: ผลวิเคราะห์ทุกชิ้นต้องบอกได้ว่ามาจากอะไร
2. ซื่อตรงต่อความไม่แน่นอน: แยกข้อมูลไม่พอกับไม่พบ ไม่อวดเกินหลักฐาน
3. บันทึกต้องง่ายและเร็ว เพราะการวิเคราะห์ทั้งหมดขึ้นกับข้อมูลที่บันทึก
4. งบ เป้าหมาย และพยากรณ์ต้องเชื่อมกันเป็นแผนเดียว
