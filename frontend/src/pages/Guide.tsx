import { Link } from 'react-router-dom';
import { ArrowRight, Wallet, ScanLine, PiggyBank, Target, ChartColumn, TrendingUp, ShieldCheck } from 'lucide-react';
import './Guide.css';

// Static public content: no session, profile, storage, or financial API access.
export default function Guide(){
 return <div className="guide-page" lang="th">
<a className="guide-skip" href="#guide-content">ข้ามไปเนื้อหาคู่มือ</a>
<header className="guide-header"><span className="guide-brand"><span className="guide-logo" aria-hidden="true">S</span><span>SpendSense<small>คู่มือการใช้งาน</small></span></span><nav aria-label="บัญชีผู้ใช้"><Link to="/login">เข้าสู่ระบบ</Link><Link className="guide-primary" to="/register">สมัครสมาชิก</Link></nav></header>
<main id="guide-content" tabIndex={-1}>
<div className="guide-intro"><span className="guide-eyebrow">เริ่มต้นทีละขั้น</span><h1>แนะนำการใช้งาน SpendSense</h1><p>บันทึกการเงิน ติดตามงบและเป้าหมาย แล้วใช้ข้อมูลย้อนหลังประกอบการตัดสินใจ อ่านคู่มือนี้ได้โดยไม่ต้องเข้าสู่ระบบ</p><div className="guide-actions"><Link className="guide-primary" to="/register">เริ่มต้นใช้งาน <ArrowRight size={18} aria-hidden="true" /></Link><a href="#guide-start">ดูขั้นตอนเริ่มใช้งาน ↓</a></div></div>
<nav className="guide-topics" aria-label="หัวข้อในคู่มือ"><a href="#guide-start">เริ่มใช้งาน</a><a href="#guide-transactions">บันทึกรายรับและรายจ่าย</a><a href="#guide-ocr">อ่านสลิปด้วย OCR</a><a href="#guide-budget">ติดตามงบประมาณ</a><a href="#guide-goals">ตั้งเป้าหมายการออม</a><a href="#guide-behavior">Behavior: พฤติกรรมการใช้จ่าย</a><a href="#guide-forecast">Forecast: รายจ่ายรวม 7 วัน</a><a href="#guide-anomaly">Anomaly: รายการที่ควรตรวจสอบ</a><a href="#guide-limits">ข้อจำกัดของระบบ</a></nav>
<section className="guide-start" id="guide-start" aria-labelledby="guide-start-title"><span className="guide-eyebrow">เริ่มต้นใน 3 ขั้นตอน</span><h2 id="guide-start-title">สร้างบัญชีและตั้งค่า</h2>
     <ol><li>สมัครสมาชิกด้วยอีเมล รหัสผ่าน และการยืนยันรหัสผ่าน แล้วเข้าสู่ระบบ</li><li>เมื่อระบบแสดงหน้าตั้งค่าเริ่มต้น ระบุข้อมูลพื้นฐาน เช่น รายได้ งบประมาณ และความตั้งใจทางการเงิน หรือเลือกข้ามไปก่อน</li><li>แก้ไขข้อมูลภายหลังได้ในหน้าตั้งค่า หากลืมรหัสผ่าน ให้ใช้ลิงก์ในหน้าเข้าสู่ระบบ</li></ol>

    </section>
<section aria-labelledby="guide-features-title"><span className="guide-eyebrow">รู้จักเครื่องมือของคุณ</span><h2 id="guide-features-title">จากการบันทึก สู่การวางแผน</h2><div className="guide-sections"><article className="guide-card" id="guide-transactions" aria-labelledby="guide-transactions-title"><span className="guide-icon"><Wallet size={22} aria-hidden="true" /></span><h3 id="guide-transactions-title">บันทึกรายรับและรายจ่าย</h3><p>เลือกประเภทรายการ หมวดหมู่ วันที่ และจำนวนเงิน ใส่รายละเอียดหรือวิธีชำระเงินตามต้องการ เวลาเกิดรายการเป็นข้อมูลไม่บังคับ</p><p>ตรวจและแก้ไขรายการได้ในประวัติธุรกรรม หากระบบยังไม่ทราบผลบันทึก ให้ตรวจประวัติและใช้ปุ่มลองคำขอเดิมตามที่หน้าจอแสดง</p></article>
<article className="guide-card" id="guide-ocr" aria-labelledby="guide-ocr-title"><span className="guide-icon"><ScanLine size={22} aria-hidden="true" /></span><h3 id="guide-ocr-title">อ่านสลิปด้วย OCR</h3><ol><li>สำหรับรายจ่าย เลือกภาพ JPG, PNG หรือ WebP เพื่ออ่านข้อมูลด้วย OCR บนอุปกรณ์ ภาพไม่ถูกจัดเก็บกับธุรกรรมหรือส่งไปบริการ OCR ภายนอก</li><li>ค่าที่อ่านได้ชัดเจนจะเติมลงฟอร์ม โดยไม่ทับช่องที่คุณแก้เอง ช่องที่อ่านไม่ได้หรือกำกวมต้องตรวจและกรอกเอง</li><li>ตรวจยอด วันที่ หมวดหมู่ และข้อมูลอื่นให้ถูกต้อง แล้วกด “ยืนยันและบันทึกธุรกรรม” การสแกนไม่บันทึกรายการให้อัตโนมัติ</li></ol></article>
<article className="guide-card" id="guide-budget" aria-labelledby="guide-budget-title"><span className="guide-icon"><PiggyBank size={22} aria-hidden="true" /></span><h3 id="guide-budget-title">ติดตามงบประมาณ</h3>
     <p>เลือกเดือน ตั้งงบรวมและงบรายหมวด แล้วติดตามรายจ่ายที่บันทึกเทียบกับงบ การแจ้งเตือนใกล้ถึงหรือเกินงบขึ้นกับการตั้งค่าและข้อมูลที่มี</p>

    </article>
<article className="guide-card" id="guide-goals" aria-labelledby="guide-goals-title"><span className="guide-icon"><Target size={22} aria-hidden="true" /></span><h3 id="guide-goals-title">ตั้งเป้าหมายการออม</h3>
     <p>สร้างเป้าหมาย ระบุยอดที่ต้องการและวันเป้าหมายถ้ามี บันทึกการออมผ่านหน้าเป้าหมายเพื่อติดตามความก้าวหน้า</p>
     <p>การประเมินความเป็นไปได้เปรียบเทียบยอดที่ต้องออมต่อเดือนกับกระแสเงินสดสุทธิที่บันทึกในเดือนปฏิทินเต็มล่าสุดที่จบแล้ว หากไม่มีวันเป้าหมายหรือข้อมูลอ้างอิงไม่พอ บางส่วนจะยังประเมินไม่ได้</p>

    </article>
<article className="guide-card" id="guide-behavior" aria-labelledby="guide-behavior-title"><span className="guide-icon"><ChartColumn size={22} aria-hidden="true" /></span><h3 id="guide-behavior-title">Behavior: พฤติกรรมการใช้จ่าย</h3>
     <p>เลือกช่วงเวลาเพื่อดูยอดรายจ่าย หมวดหมู่ ความถี่ ค่าเฉลี่ย สัดส่วน และเปรียบเทียบกับช่วงก่อนหน้าที่มีจำนวนวันเท่ากัน</p>
     <p>ข้อค้นพบขึ้นกับความพร้อมของข้อมูลในแต่ละช่วงและแต่ละหมวด เกณฑ์หลักคือรายจ่ายอย่างน้อย 30 รายการ และช่วงวันแรกถึงวันสุดท้ายอย่างน้อย 30 วันโดยนับรวมทั้งสองวัน การเปรียบเทียบรายหมวดและการวิเคราะห์เวลามีเกณฑ์เพิ่มเติม</p>

    </article>
<article className="guide-card" id="guide-forecast" aria-labelledby="guide-forecast-title"><span className="guide-icon"><TrendingUp size={22} aria-hidden="true" /></span><h3 id="guide-forecast-title">Forecast: รายจ่ายรวม 7 วัน</h3>
     <p>ระบบรวมรายจ่ายทุกหมวดเป็นยอดรายวัน แล้วใช้วิธี Holt พยากรณ์ยอดรวมชุดเดียว แสดงยอดรายวันและยอดรวมตั้งแต่วันนี้ถึงอีก 6 วัน โดยใช้ประวัติถึงเมื่อวานตามเวลาไทย</p>
     <p>ต้องมีรายจ่ายถึงวันตัดข้อมูลอย่างน้อย 30 รายการ ครอบคลุมอย่างน้อย 30 วันนับรวมวันแรกและวันสุดท้าย หากไม่ผ่านจะยังไม่แสดงค่าพยากรณ์ ไม่มีผลพยากรณ์แยกหมวดหมู่</p>

    </article>
<article className="guide-card" id="guide-anomaly" aria-labelledby="guide-anomaly-title"><span className="guide-icon"><ShieldCheck size={22} aria-hidden="true" /></span><h3 id="guide-anomaly-title">Anomaly: รายการที่ควรตรวจสอบ</h3>
     <p>เมื่อเปิดการคัดกรองในหน้าตั้งค่า ระบบใช้ข้อมูลย้อนหลังที่ผ่านเกณฑ์ความพร้อมเพื่อเสนอรายการที่ยอดเงินหรือช่วงเวลาแตกต่างจากรูปแบบเดิม ไม่ใช่การยืนยันการทุจริต และการเปิดใช้ไม่แจ้งย้อนหลัง</p>
     <p>อ่านเหตุผลและข้อมูลเปรียบเทียบ แล้วตัดสินแต่ละมิติว่าเป็นรายการปกติ ถูกต้องแต่เกิดเป็นครั้งคราว หรือผิดปกติ หากมีหลายมิติที่รอตรวจ ต้องพิจารณาแต่ละมิติให้ครบ</p>

    </article></div></section>
<section className="guide-limits" id="guide-limits" aria-labelledby="guide-limits-title"><span className="guide-eyebrow">อ่านประกอบก่อนใช้งาน</span><h2 id="guide-limits-title">ข้อควรรู้และข้อจำกัดของระบบ</h2><div className="guide-limit-grid"><div><h3>สร้างบัญชีและตั้งค่า</h3><p className="guide-note">รายได้ในโปรไฟล์ใช้วางแผน ไม่ใช่รายการรายรับจริง ต้องบันทึกธุรกรรมเพื่อให้ยอดจริงสะท้อนข้อมูลของคุณ</p></div>
<div><h3>บันทึกรายรับ รายจ่าย และอ่านสลิป</h3><p className="guide-note">“สแกนสำเร็จ” หมายถึงอ่านภาพเสร็จ ไม่ได้ยืนยันว่าข้อมูลครบหรือถูกต้องทุกช่อง เวลาในฟอร์มหรือเวลาจาก OCR ไม่ถือว่าถูกยืนยันสำหรับการวิเคราะห์โดยอัตโนมัติ</p></div>
<div><h3>ติดตามงบประมาณ</h3><p className="guide-note">งบเป็นวงเงินอ้างอิง ไม่ได้ห้ามการใช้จ่ายจริงหรือรับประกันว่าจะไม่เกินงบ รายการที่ยังไม่ได้บันทึกจะไม่สะท้อนในยอด</p></div>
<div><h3>ตั้งเป้าหมายการออม</h3><p className="guide-note">เป็นข้อมูลประกอบการวางแผน ไม่ได้จัดสรรเงินให้อัตโนมัติ ไม่ถือว่าเงินสุทธิทั้งหมดต้องนำมาออม และไม่รับประกันรายได้ในอนาคต</p></div>
<div><h3>Behavior: พฤติกรรมการใช้จ่าย</h3><p className="guide-note">การวิเคราะห์เวลาใช้เฉพาะเวลาเกิดรายการที่ผู้ใช้ยืนยันแล้ว ไม่ใช้เวลาที่บันทึกรายการแทน หากข้อมูลไม่พอ ระบบจะไม่สรุปส่วนนั้น รูปแบบที่พบไม่พิสูจน์สาเหตุ และรายการที่ดูเหมือนเกิดซ้ำไม่ได้ยืนยันว่าเป็นบิลประจำ</p></div>
<div><h3>Forecast: รายจ่ายรวม 7 วัน</h3><p className="guide-note">เป็นประมาณการจากข้อมูลที่บันทึก ข้อมูลเก่าหรือขาดช่วงอาจทำให้คลาดเคลื่อน การเทียบงบใช้เฉพาะวันพยากรณ์ในเดือนปัจจุบัน จึงไม่รับประกันว่าจะอยู่ในงบทั้งเดือน</p></div>
<div><h3>Anomaly: รายการที่ควรตรวจสอบ</h3><p className="guide-note">แต่ละมิติอาจยังไม่พร้อมประเมิน การตัดสินเก็บประวัติแยกจากยอดธุรกรรม การจับคู่รูปแบบตามรอบด้วยยอดเงินอัตโนมัติยังปิดอยู่ ผู้ใช้ต้องตรวจและตัดสินเอง</p></div></div></section>
<footer className="guide-footer"><p>คู่มือนี้เป็นข้อมูลทั่วไป ไม่อ่านข้อมูลบัญชีหรือข้อมูลการเงินของคุณ การเปิดดูคู่มือไม่ถือเป็นการให้ความยินยอม</p><a href="#guide-content">กลับต้นคู่มือ</a></footer></main></div>;
}
