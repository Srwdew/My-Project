import { Link } from "react-router-dom";
import "./Guide.css";

// Draft: describes what the code actually stores and does. Not reviewed legal text.
export default function Privacy() {
  return (
    <div className="guide-page" lang="th">
      <header className="guide-header">
        <Link className="guide-brand" to="/">
          <span className="guide-logo" aria-hidden="true">
            <img src="/logo.svg" alt="" width="100%" height="100%" />
          </span>
          <span>
            KebTang<small>นโยบายความเป็นส่วนตัว</small>
          </span>
        </Link>
        <nav aria-label="บัญชีผู้ใช้">
          <Link to="/login">เข้าสู่ระบบ</Link>
          <Link className="guide-primary" to="/register">
            สมัครสมาชิก
          </Link>
        </nav>
      </header>
      <main className="privacy-main">
        <h1>นโยบายความเป็นส่วนตัว (PDPA)</h1>
        <p className="privacy-draft" role="note">
          ฉบับร่างสำหรับโปรเจกต์วิชาการ อธิบายตามการทำงานของระบบในปัจจุบัน
          ยังไม่ผ่านการตรวจทางกฎหมาย
        </p>

        <section>
          <h2>ข้อมูลที่เราเก็บ</h2>
          <ul>
            <li>อีเมล และรหัสผ่านที่เข้ารหัสแบบทางเดียว (ระบบไม่เก็บรหัสผ่านจริง)</li>
            <li>
              ข้อมูลโปรไฟล์ที่คุณกรอกเอง เช่น ชื่อที่แสดง รายได้ วันเงินเดือนออก
              และความตั้งใจทางการเงิน
            </li>
            <li>
              ธุรกรรม งบประมาณ เป้าหมายการออม
              และผลการตัดสินรายการที่ควรตรวจสอบที่คุณบันทึก
            </li>
            <li>วันสมัครและเวลาเข้าสู่ระบบล่าสุด</li>
          </ul>
        </section>

        <section>
          <h2>เราใช้ข้อมูลทำอะไร</h2>
          <ul>
            <li>
              แสดงภาพรวม งบประมาณ เป้าหมาย และการวิเคราะห์ Behavior, Forecast
              และ Anomaly ของบัญชีคุณเอง
            </li>
            <li>ส่งอีเมลลิงก์ตั้งรหัสผ่านใหม่เมื่อคุณขอเท่านั้น</li>
            <li>ไม่ขายหรือส่งต่อข้อมูลการเงินให้บุคคลภายนอก</li>
          </ul>
        </section>

        <section>
          <h2>การอ่านสลิปด้วย OCR</h2>
          <p>
            ภาพสลิปถูกอ่านบนอุปกรณ์ของคุณ
            ไม่ถูกจัดเก็บกับธุรกรรมและไม่ส่งไปบริการ OCR ภายนอก
            ระบบเก็บเฉพาะค่าที่คุณตรวจแล้วกดบันทึก
          </p>
        </section>

        <section>
          <h2>ผู้ดูแลระบบเห็นอะไร</h2>
          <p>
            ผู้ดูแลระบบเห็นเฉพาะอีเมล ชื่อที่แสดง วันสมัคร เวลาเข้าใช้ล่าสุด
            จำนวนธุรกรรม และสถานะความพร้อมของข้อมูล
            ไม่เห็นยอดเงินหรือรายละเอียดธุรกรรม
          </p>
        </section>

        <section>
          <h2>การปิดบัญชี</h2>
          <p>
            คุณปิดบัญชีได้ในหน้าตั้งค่า เมื่อปิดแล้วจะเข้าสู่ระบบไม่ได้อีก
            ข้อมูลยังถูกเก็บไว้ในฐานข้อมูลโดยไม่แสดงต่อผู้ใช้อื่น
            หากต้องการให้ลบข้อมูลถาวร โปรดติดต่อผู้ดูแลระบบ
          </p>
        </section>

        <p className="privacy-back">
          <Link to="/register">กลับไปสมัครสมาชิก</Link>
          <Link to="/">กลับหน้าแรก</Link>
        </p>
      </main>
    </div>
  );
}
