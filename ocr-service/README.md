# SpendSense OCR service (อ่านละเอียด)

บริการ PaddleOCR สำหรับปุ่ม "อ่านละเอียด" ในหน้าเพิ่มรายการ ใช้เมื่อการอ่านบนอุปกรณ์ (Tesseract) อ่านได้ไม่ครบ ผู้ใช้ต้องกดเองทุกครั้ง

- ภาพถูกย่อให้ด้านยาวไม่เกิน 1600px ในเบราว์เซอร์ แล้วส่งผ่าน backend (`POST /receipts/ocr`, ต้องล็อกอิน) มาที่บริการนี้
- ประมวลผลในหน่วยความจำ ไม่บันทึกภาพหรือ log ข้อมูลภาพ
- รับเฉพาะ `127.0.0.1` โดยค่าเริ่มต้น

## ติดตั้งและรัน (Windows, Python 3.13)

```bash
cd ocr-service
py -3 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True .venv/Scripts/python server.py
```

ครั้งแรกจะดาวน์โหลดโมเดล (`PP-OCRv5_server_det`, `th_PP-OCRv5_mobile_rec`) ไปที่ `~/.paddlex/official_models`

## ตั้งค่า

| ตัวแปร | ค่าเริ่มต้น | ใช้ที่ |
|---|---|---|
| `OCR_SERVICE_URL` | `http://127.0.0.1:8765` | backend |
| `OCR_HOST` / `OCR_PORT` | `127.0.0.1` / `8765` | บริการนี้ |
| `OCR_THREADS` | `8` | จำนวน CPU thread |

## หมายเหตุที่วัดไว้ (24 ต.ค. 2026, โน้ตบุ๊ก CPU)

- ใช้ `paddlepaddle==3.2.2`: รุ่น 3.3.x ใช้ oneDNN บน CPU ไม่ได้ (error `ConvertPirAttribute2RuntimeAttribute`) ถ้าปิด oneDNN จะช้าลงประมาณ 3 เท่า
- ประมาณ 12–15 วินาทีต่อใบที่ 1600px ถ้าย่อเหลือ 1200px บรรทัดส่วนลดหาย ยอดเงินจึงตรวจไม่ผ่าน
- ตัวหาบรรทัดรุ่น mobile ช้ากว่าและแม่นน้อยกว่ารุ่น server สำหรับภาพใบเสร็จ
- ทดสอบกับใบเสร็จ 7-Eleven 2 ใบ ได้ วันที่ เวลา และยอดเงินถูกทั้งคู่
