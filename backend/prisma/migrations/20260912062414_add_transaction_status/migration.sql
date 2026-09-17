BEGIN;

-- สร้างชนิดสถานะธุรกรรม
CREATE TYPE "TransactionStatus" AS ENUM ('planned', 'completed');

-- เพิ่มคอลัมน์โดยยอมให้ว่างชั่วคราว
ALTER TABLE "Transaction"
ADD COLUMN "status" "TransactionStatus";

-- กำหนดสถานะให้ข้อมูลทดลองเดิมครั้งเดียว
-- อ้างอิงวันที่ประเทศไทย ณ เวลาที่รัน migration
UPDATE "Transaction"
SET "status" = CASE
  WHEN "transactionDate" >
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
  THEN 'planned'::"TransactionStatus"
  ELSE 'completed'::"TransactionStatus"
END;

-- เมื่อเติมครบแล้ว บังคับให้ทุกรายการต้องมีสถานะ
ALTER TABLE "Transaction"
ALTER COLUMN "status" SET NOT NULL;

COMMIT;