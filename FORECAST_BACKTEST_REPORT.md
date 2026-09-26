# Forecast chronological backtest — 26 กันยายน 2026

Model: holt-category-v1-ca068bab730d2022 (constants ใน backend/src/lib/holt.ts)
เป็นการตรวจด้วยข้อมูลสังเคราะห์ที่สร้างใน tests/forecast.backtest.test.ts เท่านั้น ไม่มีข้อมูลผู้ใช้จริง ไม่มีการอ้าง accuracy สำหรับผู้ใช้จริง

## Method
3 synthetic account scenarios (constant, declining, variable) ไม่สร้างบัญชีจริงสำหรับ calculation backtest
Trainingสูงสุด180วันถึงcutoff;42วันขั้นต่ำ และeligibilityแยกหมวดจากข้อมูลที่มีณcutoffเท่านั้น
Inner cuts n-21,n-14,n-7,7-day horizon,121alpha/beta pairs;เลือกMAEแล้วMSEแล้วalpha/betaตามลำดับ Fit trainingใหม่ทั้งชุดหลังเลือก
Outer horizon7วัน; windowของแต่ละscenarioเลื่อน7วัน ไม่สุ่มแบ่ง เลือกหมวดจากeligibilityไม่ใช่accuracy
error=actual-predicted;MAE=mean(abs(error));RMSE=sqrt(mean(error^2))
ประเมินยอดรวมรายวันของชุดหมวดที่eligibleณcutoffเทียบactualของหมวดชุดเดียวกัน ความครอบคลุมแสดงแยกจากerror
Zero actualเข้าคำนวณได้โดยไม่หารactual;ไม่ใช้MAPE
วันที่ไม่มีรายการในseriesและactualเป็นยอดที่บันทึก0 ไม่รับรองว่าไม่มีรายจ่ายจริง
Outputclippingและroundingตรงliveก่อนประเมิน

## Observed results (synthetic)
Constant100ต่อวัน: cutoffs2026-02-11,02-18,02-25;7daysแต่ละรอบ MAE0.00/RMSE0.00
Observed/eligible category counts:1/1,2/1,2/1 ตามลำดับ หมวดที่เกิดหลังcutแรกไม่ถูกนำมาtuneหรือบวกactualเข้าคะแนน
Declining42..1ก่อนcutแล้วactual0: cutoff2026-02-11;eligible1จาก2;MAE0.00/RMSE0.00 outputถูกclampเป็น0
ทดสอบแก้futureactualของconstantให้เป็น0: forecast/parameters/coverageณcut2026-02-11คงเดิม MAE100.00/RMSE100.00 พิสูจน์ว่าไม่ได้เลือกparametersจากoutertest

Variable fixture:84วันเริ่ม2026-01-01;หมวดdailyมีweekly pattern + deterministic spikes,หมวดoccasionalบันทึกทุก3วัน และnew categoryเริ่ม2026-02-20
| Cutoff | Horizon | Eligible/observed | Zero-filled training days (eligible) | MAE บาท | RMSE บาท |
|---|---:|---:|---:|---:|---:|
|2026-02-11|7|2/2|28|75.80|80.35|
|2026-02-18|7|2/2|32|87.10|92.03|
|2026-02-25|7|2/3|37|76.77|82.38|
|2026-03-04|7|2/3|42|79.55|87.45|

รวม8outerwindowsใน3scenarios และอีก1counterfactual future-zero check
ค่าerrorศูนย์ในseriesง่ายไม่ใช่หลักฐานความแม่นยำ ไม่เลือกลบหมวดที่errorสูงหรือปรับเกณฑ์จากผลชุดนี้
ข้อจำกัด:ตัวอย่างน้อย สังเคราะห์ ไม่มี seasonality model ไม่มี uncertainty intervals ไม่มีผล prospective user data และไม่ได้ประเมินความครบถ้วนการบันทึก การแก้/ลบย้อนหลังทำให้ผล backtestบนข้อมูลปัจจุบันต่างจากข้อมูลที่เคยเห็นจริงได้
