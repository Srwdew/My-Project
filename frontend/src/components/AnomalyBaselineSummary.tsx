type Snapshot={gate?:{ready:boolean;count:number;inclusiveDays:number};scope?:{amount:string;time:string};scores?:{amount:{modifiedZ:string|null};time:{bucketFrequency:string|null;nearbyFrequency:string|null}}|null};
export default function AnomalyBaselineSummary({snapshot:s}:{snapshot:Snapshot}){
 if(!s.gate)return null;
 const label=(v?:string)=>v==='category'?'หมวดเดียวกันของบัญชีนี้':'fallback รวมบัญชีนี้';
 return <div className="anomaly-baseline-summary"><p>เกณฑ์บัญชี: {s.gate.ready?'ผ่าน':'ยังไม่ผ่าน'} · {s.gate.count} รายการ / {s.gate.inclusiveDays} วันรวมต้น–ปลาย (ขั้นต่ำ 30 / 30)</p>
 {s.gate.ready&&<p>Baseline จำนวนเงิน: {label(s.scope?.amount)} · เวลา: {label(s.scope?.time)}</p>}
 {s.scores&&<details><summary>คะแนนที่ใช้ประเมิน</summary>{s.scores.amount.modifiedZ!==null&&<p>Modified Z: {s.scores.amount.modifiedZ}</p>}<p>ความถี่ช่วงเวลา {s.scores.time.bucketFrequency??'ยังไม่มีข้อมูล'} · รอบเวลา {s.scores.time.nearbyFrequency??'ยังไม่มีข้อมูล'}</p></details>}</div>;
}
