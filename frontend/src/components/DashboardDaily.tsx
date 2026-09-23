import { calendarDays, moneyText, type DailyAmount } from '../utils/dashboard';
export default function DashboardDaily({ month, asOfDate, daily }: { month: string; asOfDate: string; daily: DailyAmount[] }) {
  const days = calendarDays(month, asOfDate, daily);
  const max = Math.max(1, ...daily.flatMap(d => [Number(d.incomeAmount), Number(d.expenseAmount)]));
  return <section className="dashboard-panel"><h2>รายรับ / รายจ่ายรายวัน</h2>
    <p>แสดงเฉพาะยอดที่บันทึก ช่องว่างไม่ได้ยืนยันว่าไม่มีรายรับหรือรายจ่าย</p>
    <p className="dashboard-legend"><span>● รายรับ (แถบซ้าย)</span><span>■ รายจ่าย (แถบขวา)</span></p>
    {daily.length ? <svg className="dashboard-chart" viewBox="0 0 720 230" role="img" aria-label="กราฟแท่งรายรับและรายจ่ายรายวัน ข้อมูลที่อ่านได้อยู่ในตารางด้านล่าง">
      <line x1="20" y1="190" x2="710" y2="190" stroke="#8092a4" />
      {days.map((d, i) => { const x = 24 + i * 680 / days.length; const width = 680 / days.length / 3; return <g key={d.date}>
        {d.row && d.state === 'recorded' && <><rect x={x} y={190 - Number(d.row.incomeAmount) / max * 165} width={width} height={Number(d.row.incomeAmount) / max * 165} fill="#176a54" /><rect x={x + width} y={190 - Number(d.row.expenseAmount) / max * 165} width={width} height={Number(d.row.expenseAmount) / max * 165} fill="#b54438" /></>}
        {!d.row && <text x={x + width} y="183" textAnchor="middle" fill="#6b7785" fontSize="10">{d.state === 'future' ? '·' : '—'}</text>}
        {(i % 5 === 0 || i === days.length - 1) && <text x={x + width} y="211" textAnchor="middle" fontSize="11">{i + 1}</text>}
      </g>; })}
    </svg> : <p>ยังไม่มีรายการสำหรับกราฟในเดือนนี้</p>}
    <details><summary>ตารางข้อมูลรายวัน ({days.length} วัน)</summary><div className="dashboard-table-wrap" tabIndex={0} role="region" aria-label="ตารางรายวัน เลื่อนแนวนอนได้"><table><caption>ยอดจากรายการที่บันทึก หน่วยบาท</caption><thead><tr><th scope="col">วันที่</th><th scope="col">สถานะ</th><th scope="col">รายรับ</th><th scope="col">รายจ่าย</th></tr></thead><tbody>{days.map(d => <tr key={d.date}><th scope="row">{d.date}</th><td>{d.state === 'future' ? 'ยังไม่ถึงวัน' : d.row ? `${d.row.transactionCount} รายการ` : 'ไม่มีรายการที่บันทึก'}</td><td>{d.state === 'recorded' && d.row ? moneyText(d.row.incomeAmount) : '—'}</td><td>{d.state === 'recorded' && d.row ? moneyText(d.row.expenseAmount) : '—'}</td></tr>)}</tbody></table></div></details>
  </section>;
}