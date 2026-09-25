# Anomaly v1 — synthetic calibration report

24 กันยายน 2026 (Asia/Bangkok)

ใช้ aggregate fixtures ที่สร้างขึ้นเองใน backend/tests/anomaly.test.ts และแถวจำลอง PostgreSQL ใน anomaly.database.test.ts ไม่ใช้ข้อมูลจริงของผู้ใช้ ไม่ใช้ข้อมูลต่างบัญชีทำ fixture และไม่อ้าง sensitivity/precision/recall จากสถานการณ์จำนวนน้อยนี้

| กรณีจำลอง | ยอด/ข้อมูล | ผลคาดหวัง | ผลรันจริง |
|---|---|---|---|
| typical | X100, median100, MAD20 | not_flagged | ผ่าน |
| high | X1000, median100, MAD20 | flagged | ผ่าน |
| constantBoundary | ทุกยอด100, X200 | not_flagged (เท่าขอบ) | ผ่าน |
| constantHigh | ทุกยอด100, X200.01 | amount_zero_dispersion / flagged | ผ่าน |
| rareTime | confirmed60, bucket0, nearby0, coverage100% | flagged | ผ่าน |
| boundaryNearby | confirmed60, bucket0, nearby30 | not_flagged | ผ่าน |

ตรวจเพิ่มเติม: Z=3.5 ไม่ flag, Z>3.5 flag เมื่อผ่าน money floor; Z=5 ไม่เพิ่มระดับ, Z>5 เพิ่มระดับ; IQR fence เท่าขอบไม่ flag; money difference เท่าขอบ100บาท/50%ไม่ flag; frequency3/60=5% ไม่ flag; mixed nonconstant MAD=IQR=0 งดประเมินจำนวนเงิน; น้อยกว่า minima งดประเมิน

PostgreSQL fixtures ยืนยัน median 0.08/MAD0.01 จากยอด0.07และ0.09, 30ยอด100เท่ากัน, และ60เวลาที่ยืนยัน23:55 เทียบ00:05ไม่เตือนจากขอบเที่ยงคืน แต่08:00พบสัญญาณ

ข้อจำกัด: เป็นการตรวจพฤติกรรมของ v1 และขอบสูตร ไม่ใช่การพิสูจน์ความแม่นยำหรือ threshold ที่เหมาะกับทุกหมวด ไม่มีการปรับค่าในรอบนี้ ก่อนเปลี่ยน constants ต้องเพิ่มชุดข้อมูลสังเคราะห์ที่มี skew/seasonality/recurring payments/rare legitimate purchases หรือข้อมูลที่ได้รับอนุญาต และรายงาน false alerts/missed injections แยกหมวดพร้อมเปรียบเทียบ ruleVersion เดิม
## Feedback eligibility fixtures — 24 กันยายน 2026

เพิ่ม synthetic PostgreSQL fixtures เปรียบเทียบ eligibility endpoint กับ aggregateจริง: legacy/ไม่ยืนยันเวลา, pending, flagged-unreviewed, normal, problem, not_flagged, cold-start not_evaluated, reviewเก่าเทียบrevisionใหม่, delete/income. ยอด0.07เข้าbaselineเมื่อมีสิทธิ์และถูกตัดออกเมื่อproblem; normalไม่เพิ่มtime confirmation. ผลคาดหวังตรงทั้งสองด้าน. กฎตัวเลข/window/minimaไม่เปลี่ยน เพิ่มเพียงbaselineEligibility policy version และไม่อ้างความแม่นยำจากข้อมูลจริง