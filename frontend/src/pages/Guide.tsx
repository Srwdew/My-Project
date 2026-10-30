import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Wallet,
  ScanLine,
  PiggyBank,
  Target,
  ChartColumn,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";
import "./Guide.css";

// Illustrative preview only: fixed sample values, never the visitor's data.
const PREVIEW = [
  { day: "จ", value: 62, past: true },
  { day: "อ", value: 48, past: true },
  { day: "พ", value: 71, past: true },
  { day: "พฤ", value: 55 },
  { day: "ศ", value: 66 },
  { day: "ส", value: 82 },
  { day: "อา", value: 58 },
];

const REVEAL =
  ".guide-intro, .guide-preview, .guide-principles li, .guide-topics, #guide-content h2, .guide-limits-lead, .guide-start li, .guide-group, .guide-card, .guide-limit-grid > div, .guide-cta, .guide-footer";

// Static public content: no session, profile, storage, or financial API access.
export default function Guide() {
  const page = useRef<HTMLDivElement>(null);
  // In-page links: smooth scroll, then briefly highlight the section that was jumped to.
  useEffect(() => {
    const root = page.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer = 0;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        'a[href^="#"]',
      );
      const target = link && root.querySelector<HTMLElement>(link.hash);
      if (!target || event.button !== 0 || event.metaKey || event.ctrlKey)
        return;
      event.preventDefault();
      [target, ...target.querySelectorAll(".reveal")].forEach((el) =>
        el.classList.add("is-in"),
      );
      target.scrollIntoView({
        behavior: reduce.matches ? "auto" : "smooth",
        block: "start",
      });
      if (target.tabIndex < 0 && !target.hasAttribute("tabindex"))
        target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      history.replaceState(null, "", link.hash);
      root
        .querySelectorAll(".is-target")
        .forEach((el) => el.classList.remove("is-target"));
      // Restart the highlight animation even when the same link is clicked twice.
      void target.offsetWidth;
      target.classList.add("is-target");
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => target.classList.remove("is-target"),
        1800,
      );
    };
    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("click", onClick);
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const root = page.current;
    if (
      !root ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const items = [...root.querySelectorAll<HTMLElement>(REVEAL)];
    items.forEach((el) => {
      // Stagger siblings of the same kind (steps, feature rows, limit items).
      const same = [...(el.parentElement?.children ?? [])].filter(
        (c) => c.className === el.className,
      );
      el.style.setProperty("--delay", Math.min(same.indexOf(el), 5) * 80 + "ms");
      el.classList.add("reveal");
    });
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    items.forEach((el) => io.observe(el));
    root.classList.add("is-animated");
    // Reveal what is already on screen without waiting for the observer's first callback.
    const frame = requestAnimationFrame(() =>
      items.forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
          el.classList.add("is-in");
          io.unobserve(el);
        }
      }),
    );
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      root.classList.remove("is-animated");
    };
  }, []);
  return (
    <div className="guide-page" lang="th" ref={page}>
      <a className="guide-skip" href="#guide-content">
        ข้ามไปเนื้อหาคู่มือ
      </a>
      <header className="guide-header">
        <Link className="guide-brand" to="/">
          <span className="guide-logo" aria-hidden="true">
            <img src="/logo.svg" alt="" width="100%" height="100%" />
          </span>
          <span>
            KebTang<small>คู่มือการใช้งาน</small>
          </span>
        </Link>
        <nav aria-label="บัญชีผู้ใช้">
          <Link to="/login">เข้าสู่ระบบ</Link>
          <Link className="guide-primary" to="/register">
            สมัครสมาชิก
          </Link>
        </nav>
      </header>
      <main id="guide-content" tabIndex={-1}>
        <section className="guide-hero">
          <div className="guide-intro">
            <h1>
              เข้าใจเงินของคุณ
              <br />
              <span>จากรายการที่คุณบันทึกเอง</span>
            </h1>
            <p>
              KebTang ช่วยบันทึกรายรับรายจ่าย ติดตามงบและเป้าหมายการออม
              แล้ววิเคราะห์พฤติกรรม พยากรณ์รายจ่าย 7 วัน
              และชี้รายการที่ควรตรวจสอบ ทุกผลบอกเหตุผลว่ามาจากข้อมูลอะไร
            </p>
            <div className="guide-actions">
              <Link className="guide-primary" to="/register">
                เริ่มต้นใช้งาน <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#guide-start">ดูขั้นตอนเริ่มใช้งาน</a>
            </div>
          </div>
          <figure className="guide-preview" aria-label="ตัวอย่างหน้าจอพยากรณ์">
            <div className="guide-preview-head">
              <span>รายจ่ายรวม 7 วัน</span>
              <small>ตัวอย่างหน้าจอ</small>
            </div>
            <div className="guide-preview-chart" aria-hidden="true">
              {PREVIEW.map((d, i) => (
                <span
                  key={d.day}
                  className={d.past ? "is-past" : ""}
                  style={{ height: d.value + "%", animationDelay: i * 60 + "ms" }}
                >
                  <i>{d.day}</i>
                </span>
              ))}
            </div>
            <figcaption>
              <span className="is-past">ย้อนหลัง</span>
              <span>พยากรณ์</span>
            </figcaption>
            <div className="guide-preview-note">
              <ShieldCheck size={16} aria-hidden="true" />
              ต้องมีรายจ่ายอย่างน้อย 30 รายการ ครอบคลุม 30 วัน จึงเริ่มพยากรณ์
            </div>
          </figure>
        </section>

        <ul className="guide-principles" aria-label="หลักการของ KebTang">
          <li>
            <b>อธิบายได้</b>
            ทุกผลวิเคราะห์บอกว่ามาจากข้อมูลและเกณฑ์อะไร
          </li>
          <li>
            <b>ซื่อตรงต่อข้อมูล</b>
            แยก “ข้อมูลยังไม่พอ” ออกจาก “ตรวจแล้วไม่พบ”
          </li>
          <li>
            <b>บันทึกเร็ว</b>
            อ่านสลิปบนอุปกรณ์ของคุณ แล้วตรวจก่อนบันทึก
          </li>
        </ul>

        <nav className="guide-topics" aria-label="หัวข้อในคู่มือ">
          <a href="#guide-start">เริ่มใช้งาน</a>
          <a href="#guide-transactions">บันทึกรายการ</a>
          <a href="#guide-ocr">อ่านสลิป</a>
          <a href="#guide-budget">งบประมาณ</a>
          <a href="#guide-goals">เป้าหมายการออม</a>
          <a href="#guide-behavior">Behavior</a>
          <a href="#guide-forecast">Forecast</a>
          <a href="#guide-anomaly">Anomaly</a>
          <a href="#guide-limits">ข้อจำกัด</a>
        </nav>

        <section
          className="guide-start"
          id="guide-start"
          aria-labelledby="guide-start-title"
        >
          <h2 id="guide-start-title">เริ่มต้นใน 3 ขั้นตอน</h2>
          <ol>
            <li>
              <b>สร้างบัญชี</b>
              สมัครด้วยอีเมล รหัสผ่าน และการยืนยันรหัสผ่าน แล้วเข้าสู่ระบบ
            </li>
            <li>
              <b>ตั้งค่าเริ่มต้น</b>
              ระบุรายได้ งบประมาณ และความตั้งใจทางการเงิน หรือเลือกข้ามไปก่อน
            </li>
            <li>
              <b>ปรับได้ตลอด</b>
              แก้ไขข้อมูลภายหลังได้ในหน้าตั้งค่า หากลืมรหัสผ่าน
              ใช้ลิงก์ในหน้าเข้าสู่ระบบ
            </li>
          </ol>
        </section>

        <section
          className="guide-features"
          aria-labelledby="guide-features-title"
        >
          <h2 id="guide-features-title">จากการบันทึก สู่การวางแผน</h2>
          <div className="guide-sections">
            <p className="guide-group">บันทึก</p>
            <article
              className="guide-card"
              id="guide-transactions"
              aria-labelledby="guide-transactions-title"
            >
              <h3 id="guide-transactions-title">
                <Wallet size={20} aria-hidden="true" />
                บันทึกรายรับและรายจ่าย
              </h3>
              <div>
                <p>
                  เลือกประเภทรายการ หมวดหมู่ วันที่ และจำนวนเงิน
                  ใส่รายละเอียดหรือวิธีชำระเงินตามต้องการ
                  เวลาเกิดรายการเป็นข้อมูลไม่บังคับ
                </p>
                <p>
                  ตรวจและแก้ไขรายการได้ในประวัติธุรกรรม
                  หากระบบยังไม่ทราบผลบันทึก
                  ให้ตรวจประวัติและใช้ปุ่มลองคำขอเดิมตามที่หน้าจอแสดง
                </p>
              </div>
            </article>
            <article
              className="guide-card"
              id="guide-ocr"
              aria-labelledby="guide-ocr-title"
            >
              <h3 id="guide-ocr-title">
                <ScanLine size={20} aria-hidden="true" />
                อ่านสลิปด้วย OCR
              </h3>
              <ol>
                <li>
                  สำหรับรายจ่าย เลือกภาพ JPG, PNG หรือ WebP เพื่ออ่านข้อมูลด้วย
                  OCR บนอุปกรณ์ ภาพไม่ถูกจัดเก็บกับธุรกรรมหรือส่งไปบริการ OCR
                  ภายนอก
                </li>
                <li>
                  ค่าที่อ่านได้ชัดเจนจะเติมลงฟอร์ม โดยไม่ทับช่องที่คุณแก้เอง
                  ช่องที่อ่านไม่ได้หรือกำกวมต้องตรวจและกรอกเอง
                </li>
                <li>
                  ตรวจยอด วันที่ หมวดหมู่ และข้อมูลอื่นให้ถูกต้อง แล้วกด
                  “ยืนยันและบันทึกธุรกรรม” การสแกนไม่บันทึกรายการให้อัตโนมัติ
                </li>
              </ol>
            </article>
            <p className="guide-group">วางแผน</p>
            <article
              className="guide-card"
              id="guide-budget"
              aria-labelledby="guide-budget-title"
            >
              <h3 id="guide-budget-title">
                <PiggyBank size={20} aria-hidden="true" />
                ติดตามงบประมาณ
              </h3>
              <p>
                เลือกเดือน ตั้งงบรวมและงบรายหมวด
                แล้วติดตามรายจ่ายที่บันทึกเทียบกับงบ
                การแจ้งเตือนใกล้ถึงหรือเกินงบขึ้นกับการตั้งค่าและข้อมูลที่มี
              </p>
            </article>
            <article
              className="guide-card"
              id="guide-goals"
              aria-labelledby="guide-goals-title"
            >
              <h3 id="guide-goals-title">
                <Target size={20} aria-hidden="true" />
                ตั้งเป้าหมายการออม
              </h3>
              <div>
                <p>
                  สร้างเป้าหมาย ระบุยอดที่ต้องการและวันเป้าหมายถ้ามี
                  บันทึกการออมผ่านหน้าเป้าหมายเพื่อติดตามความก้าวหน้า
                </p>
                <p>
                  การประเมินความเป็นไปได้เปรียบเทียบยอดที่ต้องออมต่อเดือนกับกระแสเงินสดสุทธิที่บันทึกในเดือนปฏิทินเต็มล่าสุดที่จบแล้ว
                  หากไม่มีวันเป้าหมายหรือข้อมูลอ้างอิงไม่พอ
                  บางส่วนจะยังประเมินไม่ได้
                </p>
              </div>
            </article>
            <p className="guide-group">วิเคราะห์</p>
            <article
              className="guide-card"
              id="guide-behavior"
              aria-labelledby="guide-behavior-title"
            >
              <h3 id="guide-behavior-title">
                <ChartColumn size={20} aria-hidden="true" />
                Behavior: พฤติกรรมการใช้จ่าย
              </h3>
              <div>
                <p>
                  เลือกช่วงเวลาเพื่อดูยอดรายจ่าย หมวดหมู่ ความถี่ ค่าเฉลี่ย
                  สัดส่วน และเปรียบเทียบกับช่วงก่อนหน้าที่มีจำนวนวันเท่ากัน
                </p>
                <p>
                  ข้อค้นพบขึ้นกับความพร้อมของข้อมูลในแต่ละช่วงและแต่ละหมวด
                  เกณฑ์หลักคือรายจ่ายอย่างน้อย 30 รายการ
                  และช่วงวันแรกถึงวันสุดท้ายอย่างน้อย 30 วันโดยนับรวมทั้งสองวัน
                  การเปรียบเทียบรายหมวดและการวิเคราะห์เวลามีเกณฑ์เพิ่มเติม
                </p>
              </div>
            </article>
            <article
              className="guide-card"
              id="guide-forecast"
              aria-labelledby="guide-forecast-title"
            >
              <h3 id="guide-forecast-title">
                <TrendingUp size={20} aria-hidden="true" />
                Forecast: รายจ่ายรวม 7 วัน
              </h3>
              <div>
                <p>
                  ระบบรวมรายจ่ายทุกหมวดเป็นยอดรายวัน แล้วใช้วิธี Holt
                  พยากรณ์ยอดรวมชุดเดียว
                  แสดงยอดรายวันและยอดรวมตั้งแต่วันนี้ถึงอีก 6 วัน
                  โดยใช้ประวัติถึงเมื่อวานตามเวลาไทย
                </p>
                <p>
                  ต้องมีรายจ่ายถึงวันตัดข้อมูลอย่างน้อย 30 รายการ
                  ครอบคลุมอย่างน้อย 30 วันนับรวมวันแรกและวันสุดท้าย
                  หากไม่ผ่านจะยังไม่แสดงค่าพยากรณ์ ไม่มีผลพยากรณ์แยกหมวดหมู่
                </p>
              </div>
            </article>
            <article
              className="guide-card"
              id="guide-anomaly"
              aria-labelledby="guide-anomaly-title"
            >
              <h3 id="guide-anomaly-title">
                <ShieldCheck size={20} aria-hidden="true" />
                Anomaly: รายการที่ควรตรวจสอบ
              </h3>
              <div>
                <p>
                  เมื่อเปิดการคัดกรองในหน้าตั้งค่า
                  ระบบใช้ข้อมูลย้อนหลังที่ผ่านเกณฑ์ความพร้อมเพื่อเสนอรายการที่ยอดเงินหรือช่วงเวลาแตกต่างจากรูปแบบเดิม
                  ไม่ใช่การยืนยันการทุจริต และการเปิดใช้ไม่แจ้งย้อนหลัง
                </p>
                <p>
                  อ่านเหตุผลและข้อมูลเปรียบเทียบ
                  แล้วตัดสินแต่ละมิติว่าเป็นรายการปกติ
                  ถูกต้องแต่เกิดเป็นครั้งคราว หรือผิดปกติ
                  หากมีหลายมิติที่รอตรวจ ต้องพิจารณาแต่ละมิติให้ครบ
                </p>
              </div>
            </article>
          </div>
        </section>

        <section
          className="guide-limits"
          id="guide-limits"
          aria-labelledby="guide-limits-title"
        >
          <h2 id="guide-limits-title">ข้อควรรู้ก่อนใช้งาน</h2>
          <p className="guide-limits-lead">
            KebTang วิเคราะห์จากสิ่งที่คุณบันทึกเท่านั้น
            ส่วนนี้บอกตรง ๆ ว่าระบบทำอะไรได้และทำอะไรไม่ได้
          </p>
          <dl className="guide-limit-grid">
            <div>
              <dt>สร้างบัญชีและตั้งค่า</dt>
              <dd className="guide-note">
                รายได้ในโปรไฟล์ใช้วางแผน ไม่ใช่รายการรายรับจริง
                ต้องบันทึกธุรกรรมเพื่อให้ยอดจริงสะท้อนข้อมูลของคุณ
              </dd>
            </div>
            <div>
              <dt>บันทึกรายรับ รายจ่าย และอ่านสลิป</dt>
              <dd className="guide-note">
                “สแกนสำเร็จ” หมายถึงอ่านภาพเสร็จ
                ไม่ได้ยืนยันว่าข้อมูลครบหรือถูกต้องทุกช่อง
                เวลาในฟอร์มหรือเวลาจาก OCR
                ไม่ถือว่าถูกยืนยันสำหรับการวิเคราะห์โดยอัตโนมัติ
              </dd>
            </div>
            <div>
              <dt>ติดตามงบประมาณ</dt>
              <dd className="guide-note">
                งบเป็นวงเงินอ้างอิง
                ไม่ได้ห้ามการใช้จ่ายจริงหรือรับประกันว่าจะไม่เกินงบ
                รายการที่ยังไม่ได้บันทึกจะไม่สะท้อนในยอด
              </dd>
            </div>
            <div>
              <dt>ตั้งเป้าหมายการออม</dt>
              <dd className="guide-note">
                เป็นข้อมูลประกอบการวางแผน ไม่ได้เก็บเงินเข้าเป้าหมายให้อัตโนมัติ
                ไม่ถือว่าเงินสุทธิทั้งหมดต้องนำมาออม
                และไม่รับประกันรายได้ในอนาคต
              </dd>
            </div>
            <div>
              <dt>Behavior: พฤติกรรมการใช้จ่าย</dt>
              <dd className="guide-note">
                การวิเคราะห์เวลาใช้เฉพาะเวลาเกิดรายการที่ผู้ใช้ยืนยันแล้ว
                ไม่ใช้เวลาที่บันทึกรายการแทน หากข้อมูลไม่พอ
                ระบบจะไม่สรุปส่วนนั้น รูปแบบที่พบไม่พิสูจน์สาเหตุ
                และรายการที่ดูเหมือนเกิดซ้ำไม่ได้ยืนยันว่าเป็นบิลประจำ
              </dd>
            </div>
            <div>
              <dt>Forecast: รายจ่ายรวม 7 วัน</dt>
              <dd className="guide-note">
                เป็นประมาณการจากข้อมูลที่บันทึก
                ข้อมูลเก่าหรือขาดช่วงอาจทำให้คลาดเคลื่อน
                การเทียบงบใช้เฉพาะวันพยากรณ์ในเดือนปัจจุบัน
                จึงไม่รับประกันว่าจะอยู่ในงบทั้งเดือน
              </dd>
            </div>
            <div>
              <dt>Anomaly: รายการที่ควรตรวจสอบ</dt>
              <dd className="guide-note">
                แต่ละมิติอาจยังไม่พร้อมประเมิน
                การตัดสินเก็บประวัติแยกจากยอดธุรกรรม
                การจับคู่รูปแบบตามรอบด้วยยอดเงินอัตโนมัติยังปิดอยู่
                ผู้ใช้ต้องตรวจและตัดสินเอง
              </dd>
            </div>
          </dl>
        </section>

        <section className="guide-cta" aria-labelledby="guide-cta-title">
          <h2 id="guide-cta-title">พร้อมบันทึกรายการแรกหรือยัง</h2>
          <p>สมัครฟรีด้วยอีเมล แล้วเริ่มจากรายการที่คุณใช้จ่ายวันนี้</p>
          <Link className="guide-primary" to="/register">
            สร้างบัญชี <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>

        <footer className="guide-footer">
          <p>
            คู่มือนี้เป็นข้อมูลทั่วไป ไม่อ่านข้อมูลบัญชีหรือข้อมูลการเงินของคุณ
            การเปิดดูคู่มือไม่ถือเป็นการให้ความยินยอม
          </p>
          <nav aria-label="ลิงก์ท้ายหน้า">
            <Link to="/privacy">นโยบายความเป็นส่วนตัว</Link>
            <a href="#guide-content">กลับด้านบน</a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
