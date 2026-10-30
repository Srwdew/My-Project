export const RECEIPT_PARSER_VERSION='seven-eleven-mymo-v6';
export type ReceiptFields = { transactionDate: string | null; transactionTime: string | null; amount: string | null; description: string | null };
export type ReceiptResult = { suggestedPaymentMethod: 'cash' | 'transfer' | null; fields: ReceiptFields; issues: string[]; amountCandidates: {value:string;label:string}[] };
const months = ['มค','กพ','มีค','เมย','พค','มิย','กค','สค','กย','ตค','พย','ธค'];
const fullMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const monthIndex = (token: string) => {
  const t = token.replace(/\./g, '');
  return months.indexOf(t) + 1 || fullMonths.indexOf(t) + 1;
};
function dateValue(y: number, m: number, d: number) {
  if (y >= 2400) y -= 543;
  if (y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d
    ? date.toISOString().slice(0,10) : null;
}
function parseGenericReceipt(text: string): ReceiptResult {
  const normalized = text.normalize('NFC').replace(/\u0e4d\u0e32/g,'\u0e33').replace(/[๐-๙]/g, c => String(c.charCodeAt(0)-0x0e50));
  const lines = normalized.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const dates: string[] = [], times: string[] = [], amounts: string[] = [], names: string[] = [];
  const amountCandidates:{value:string;label:string}[]=[];
  let uncertainCurrency=false, sawAmountLabel=false;
  const currencyAmounts:string[]=[];
  const contextualTimes:string[]=[];
  const totalAmounts:string[]=[];
  // Only an explicit store header, never a product/ad mention, identifies this layout.
  const sevenEleven=lines.slice(0,3).some(line=>/^CP\s+ALL\s*,?\s*7[-‑– ]?Eleven(?=\s|$)/i.test(line));
  if(sevenEleven)names.push('7-Eleven');
  const mymoSlip=/(?:\bmy\s*mo\b|\bGSB\b|ธนาคารออมสิน)/i.test(normalized)
    && /รายการโอนเงิน(?:พร้อมเพย์)?สำเร็จ/.test(normalized)
    && lines.some(line=>/^จาก\s*[:：]?$/.test(line))
    && lines.some(line=>/^ถึง\s*[:：]?$/.test(line));
  const bankSlip=mymoSlip || (/Bangkok Bank/i.test(normalized)&&/Transaction successful/i.test(normalized)&&/^From\b/im.test(normalized)&&/^To\b/im.test(normalized))
    || (/(?:K PLUS|K\+|กสิกร)/i.test(normalized)&&/โอนเงินสำเร็จ/.test(normalized))
    || (/Krungthai|กรุงไทย/i.test(normalized)&&/ทำรายการเสร็จสมบูรณ์/.test(normalized));
  const cashEvidence=/เงินสด|เงินทอน|\bCASH\b|\bCHANGE\b/i.test(normalized);
  const suggestedPaymentMethod=sevenEleven&&!bankSlip&&cashEvidence?'cash':bankSlip&&!sevenEleven?'transfer':null;

  for (let i=0;i<lines.length;i++) {
    let line=lines[i];
    if (/^(?:amount|grand total|total paid|จำนวนเงิน|ยอดโอน)\s*[:：]?$/i.test(line) && /^\d[\d,.]*(?:\s*(?:[A-Za-z]{1,3}|บาท|฿))?$/i.test(lines[i+1]??'')) line+=' '+lines[i+1];
    // Any line naming a total (not a subtotal or tendered cash) is the payable amount and outranks other labels.
    const namesTotal=/\btotal\b/i.test(line)&&!/sub[\s-]*total|total\s+paid/i.test(line);
    if(namesTotal)line='TOTAL '+line.replace(/^.*?\btotal\b(?:\s+(?:amount|due))?\s*[:：]?\s*/i,'');
    if(mymoSlip && /^ถึง\s*[:：]?$/.test(line)){
      const recipient=lines[i+1]??'';
      if(/^[A-Za-zก-๙][A-Za-zก-๙ .'-]*$/.test(recipient) && !/พร้อมเพย์|ธนาคาร|PromptPay|bank/i.test(recipient))names.push(recipient);
    }
    if (/^(?:to|recipient|merchant|ผู้รับเงิน)\s*[:：]?$/i.test(line)) {
      const next=lines[i+1]??'';
      if (/^[A-Za-zก-๙][A-Za-zก-๙ .'-]*$/.test(next) && !/bank|reference|fee|amount/i.test(next)) names.push(next);
    }
    for(const match of line.matchAll(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4}|\d{2})\b/gi)){
      const m=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].toLowerCase())+1;
      const value=dateValue(match[3].length===2?2000+Number(match[3]):Number(match[3]),m,Number(match[1]));if(value)dates.push(value);
    }
    // Two-digit Buddhist D/M/YY is permitted only for the identified retail layout.
    if(sevenEleven&&!bankSlip){
      for(const match of line.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2})(?!\d)/g)){
        const value=dateValue(2500+Number(match[3]),Number(match[2]),Number(match[1]));
        if(value)dates.push(value);
      }
    }
    for (const match of line.matchAll(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
      const value=dateValue(+match[1],+match[2],+match[3]); if(value) dates.push(value);
    }
    for (const match of line.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)) {
      // Thai receipts are day-first; month-first only when day-first is impossible (e.g. 12/31).
      const value=dateValue(+match[3],+match[2],+match[1])??dateValue(+match[3],+match[1],+match[2]);
      if(value)dates.push(value);
    }
    for (const match of line.matchAll(/(\d{1,2})\s+([ก-๙.]+)\s*(\d{4}|\d{2})(?!\d)/g)) {
      const m=monthIndex(match[2]);
      const value=m?dateValue(match[3].length===2?2500+Number(match[3]):Number(match[3]),m,+match[1]):null;if(value)dates.push(value);
    }
    for(const match of line.matchAll(/(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?!\d)(?:\s*([AaPp])\.?\s*[Mm]\.?(?![A-Za-z]))?/g)) {let hour=+match[1];if(match[3]){if(hour<1||hour>12)continue;hour=hour%12+(/p/i.test(match[3])?12:0);}const value=String(hour).padStart(2,'0')+':'+match[2];times.push(value);if(/(?:เวลา|time)/i.test(line)||/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(line)||/\d{1,2}\s+[A-Za-zก-๙.]+\s+\d{2,4}\s/.test(line))contextualTimes.push(value);}
    // Match entire labeled value lines, never a substring of SUBTOTAL or TOTAL PAID.
    const label=line.match(/^(GRAND TOTAL|TOTAL DUE|NET AMOUNT|BALANCE DUE|AMOUNT|AMT|TOTAL|จำนวนเงินรวมทั้งสิ้น|จำนวนเงิน|จำนวน|ยอดชำระ|ยอดโอน|ยอดรวม|รวมทั้งสิ้น|ยอดสุทธิ|ยอดที่ต้องชำระ)(?=\s|[:：]|$)\s*[:：]?\s*(.*)$/i);
    // In this receipt layout ยอดรวม is the amount before discounts, not payable.
    if(label)sawAmountLabel=true;
    if(label && !(sevenEleven && label[1]==='ยอดรวม')){
      let valueText=label[2]||lines[i+1]||'';
      // A retail net-total row may include a quantity column. Only strip this
      // exact labeled structure; a bare quantity/number is never a total.
      if(label[1]==='ยอดสุทธิ'){
        const counted=valueText.match(/^[1-9]\d*\s+ชิ้น\s+(\d[\d,.]*(?:\s*(?:บาท|THB|฿))?)$/i);
        if(counted)valueText=counted[1];
      }
      // A currency-marked amount may sit below a label with QR noise between.
      // Stay in this label's section; never cross a fee/balance/tender boundary.
      if(/^จำนวน$/u.test(label[1])){
        const section=[label[2]];
        for(let j=i+1;j<Math.min(lines.length,i+4);j++){
          if(/ค่าธรรม|ยอดเงินคงเหลือ|fee|balance|change|paid|tax|vat/i.test(lines[j]))break;
          section.push(lines[j]);
        }
        const candidates=section.flatMap(v=>[...v.matchAll(/(?:^|[^\d.,])(\d{1,3}(?:,\d{3})+(?:\.\d{2})|\d+\.\d{2})\s*บาท/g)].map(m=>m[1]));
        if(new Set(candidates).size>1){for(const value of candidates){const normalized=value.replace(/,/g,'');amounts.push(normalized);amountCandidates.push({value:normalized,label:label[1]});}continue;}
        if(new Set(candidates).size===1)valueText=candidates[0];
      }
      // Recover only a separate damaged currency token, never numeric digits.
      const currencyNoise=valueText.match(/^(\d{1,3}(?:,\d{3})+\.\d{2})\s+(?:8|m8)$/i);
      if(currencyNoise && /\bTHB\b/i.test(normalized)){valueText=currencyNoise[1];uncertainCurrency=true;}
      const money=valueText.match(/^(?:(?:THB|USD|EUR|GBP|฿|\$|€|£)\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?:\s*(?:[A-Za-z]{1,3}|บาท|฿|\$|€|£))?$/i);
      if(money){const raw=money[1].replace(/,/g,'');const [whole,fraction='']=raw.split('.');
        if(/^\d{1,10}$/.test(whole)&&BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))>0n){
          const value=BigInt(whole).toString()+'.'+fraction.padEnd(2,'0');
          amounts.push(value);amountCandidates.push({value,label:label[1]});
          if(namesTotal)totalAmounts.push(value);
        }
      }
    }
    // Unlabeled currency amounts (e.g. a big "1,250.00 บาท"); used only when no amount label exists.
    if(!/ค่าธรรม|คงเหลือ|ยอดเงินในบัญชี|fee|balance|change|เงินทอน|ส่วนลด|discount|vat|ภาษี/i.test(line))
      for(const m of line.matchAll(/(?:^|[^\d.,])(?:฿\s*)?(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?=\s*(?:บาท|THB|฿)|$)/gi))
        if(/บาท|THB|฿/i.test(line))currencyAmounts.push(m[1].replace(/,/g,''));
    const recipient=line.match(/^To\s+[^A-Za-zก-๙]*([A-Za-zก-๙][A-Za-zก-๙ .'-]*)$/i);if(recipient)names.push(recipient[1].trim());
    const name=line.match(/^(?:ผู้รับเงิน|ชื่อผู้รับ|ผู้รับ|ร้านค้า|merchant|recipient|paid to)\s*[:：]\s*(.+)$/i);
    if(name && name[1].trim()) names.push(name[1].trim());
  }
  if(new Set(totalAmounts).size===1)amounts.splice(0,amounts.length,totalAmounts[0]);
  if(!sawAmountLabel&&!amounts.length&&new Set(currencyAmounts).size===1&&Number(currencyAmounts[0])>0){
    amounts.push(currencyAmounts[0]);amountCandidates.push({value:currencyAmounts[0],label:'ยอดเงิน'});
  }
  const issues:string[]=uncertainCurrency?['currency_ocr_uncertain']:[];
  const unique=(values:string[],field:string)=>{const set=[...new Set(values)];if(set.length!==1){issues.push(field+(set.length?'_ambiguous':'_not_found'));return null;}return set[0];};
  return {suggestedPaymentMethod,fields:{transactionDate:unique(dates,'date'),transactionTime:unique(contextualTimes.length?contextualTimes:times,'time'),amount:unique(amounts,'amount'),description:unique(names,'recipient')},issues,amountCandidates:amountCandidates.filter((v,i,a)=>a.findIndex(x=>x.value===v.value&&x.label===v.label)===i)};
}

/** Explicit header evidence only; allow the two header tokens on adjacent lines. */
export function isSevenElevenHeader(text:string) {
  const head=text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean).slice(0,6);
  return head.some((line,i)=>/^[^A-Za-z0-9ก-๙]*CP\s+ALL\b/i.test(line)
    && /\b7\s*[-‑–]?\s*Eleven\b/i.test(line+' '+(head[i+1]??'')))
    // CP ALL's registered tax ID identifies receipts whose store header was cropped off.
    || head.some(line=>/TA[XZ].{0,3}107542000011\b/i.test(line));
}
export function parseReceipt(text:string):ReceiptResult {
  if(!isSevenElevenHeader(text))return parseGenericReceipt(text);
  const all=text.normalize('NFC').replace(/\u0e4d\u0e32/g,'\u0e33').replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50))
    .split(/\r?\n/).map(v=>v.trim()).filter(Boolean)
    // Photo OCR adds 1-2 stray glyphs before summary labels and drops letters/parens
    // ("BE sub Tota 74.00", "= Total (42 210.00"). Only the label is repaired; digits never are.
    .map(v=>v.replace(/^[^A-Za-z0-9ก-๙]*(?:[A-Za-z0-9]{1,2}\s+)?(?=(?:sub\s*)?tota?l?\b|purse\b|cash\s*\/)/i,'')
      .replace(/^sub\s*tota?l?\b/i,'Sub Total').replace(/^tota?l?\b(\s*)\(?([1-9]\d*)\)?\s+/i,'Total$1($2) ')
      .replace(/ส่?วน\s*[ลอจต][ดตจ]/g,'ส่วนลด'));
  // The reference timestamp ends the transaction, not the promotional footer.
  const reference=/\bR[#＃$A-Z]?\d{5,}.*\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}/i;
  const ref=all.findIndex(v=>reference.test(v));
  const footer=all.findIndex(v=>/^(?:[*\s-]*ศูนย์|บิลนี้ประหยัด|รับสิทธิ|หมดเขต|ข้อมูลบัตร|Promotion\b|Thank you\b|You saved\b)/i.test(v));
  const end=ref>=0?ref+1:footer>=0?footer:all.length;
  const lines=all.slice(0,end);
  const header='CP ALL,7-Eleven'; // canonicalize only after both tokens were observed
  const money=(line:string)=>parseGenericReceipt('Amount '+line).fields.amount;
  const net=lines.filter(v=>/^(?:ยอดสุทธิ|NET AMOUNT|NET TOTAL)(?=\s|:|$)/i.test(v));
  const total=lines.filter(v=>/^Total(?=\s|:|$)/i.test(v));
  const candidates:{value:string;label:string}[]=[];
  let amount:string|null=null;
  const issues:string[]=[];
  if(net.length){
    for(const line of net){
      const v=line.replace(/^(?:ยอดสุทธิ|NET AMOUNT|NET TOTAL)\s*:?\s*/i,'')
        .replace(/^[1-9]\d*\s+ชิ้น\s+/,'');
      const value=money(v);if(value)candidates.push({label:'ยอดสุทธิ',value});
    }
    if(candidates.length===net.length&&new Set(candidates.map(v=>v.value)).size===1)amount=candidates[0].value;
    // Other explicitly payable labels can still contradict a net total.
    for(const line of lines.filter(v=>/^(?:ยอดชำระ|ยอดที่ต้องชำระ|TOTAL DUE|BALANCE DUE)\b|^(?:ยอดชำระ|ยอดที่ต้องชำระ)(?=\s|:|$)/i.test(v))){
      const r=parseGenericReceipt(line);if(r.fields.amount&&r.fields.amount!==amount){candidates.push(...r.amountCandidates);amount=null;}
    }
  }else{
    const discount=lines.some(v=>/ส่วนลด|discount|ยอดประหยัด|savings?/i.test(v));
    for(const line of total){
      const value=money(line.replace(/^Total\s*:?\s*/i,'').replace(/^\([1-9]\d*\)\s*/,''));
      if(value)candidates.push({label:'Total',value});
    }
    const single=candidates.length===total.length&&candidates.length>0&&new Set(candidates.map(v=>v.value)).size===1;
    // With discounts, Total is accepted only if Sub Total minus every discount line equals it exactly.
    if(discount&&single){
      const cents=(v:string|null|undefined)=>v?Math.round(Number(v)*100):null;
      const subs=lines.filter(v=>/^Sub\s*Total(?=\s|:|$)/i.test(v)).map(v=>cents(money(v.replace(/^Sub\s*Total\s*:?\s*/i,''))));
      const cuts=lines.filter(v=>/ส่วนลด|discount/i.test(v)).map(v=>cents(v.match(/(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/)?.[1].replace(/,/g,'')));
      const sub=subs.length===1?subs[0]:null;
      if(sub!==null&&cuts.length&&cuts.every(v=>v!==null)&&sub-cuts.reduce<number>((a,b)=>a+(b??0),0)===cents(candidates[0].value))
        amount=candidates[0].value;
    }
    if(!discount&&single){
      amount=candidates[0].value;
      for(const line of lines.filter(v=>/^(?:Sub\s*Total|ยอดรวม)(?=\s|:|$)/i.test(v))){
        const sub=money(line.replace(/^(?:Sub\s*Total|ยอดรวม)\s*:?\s*/i,''));
        if(!sub||sub!==amount)amount=null;
      }
    }
    if(discount&&!amount)candidates.length=0;
  }
  if(!amount)issues.push(candidates.length?'amount_ambiguous':'amount_not_found');
  const dateLines=ref>=0?[all[ref]]:lines.filter(v=>/^(?:Date|Time|วันที่|เวลา)\s*:?\s*\d/i.test(v)||/^\d{1,4}[/-]\d{1,2}[/-]\d{2,4}(?:\s+\d{1,2}:\d{2})?$/.test(v)||/^\d{1,2}\s+[ก-๙.]+\s+\d{2,4}(?:\s+\d{1,2}:\d{2})?$/.test(v));
  const dateResult=parseGenericReceipt(header+'\n'+dateLines.join('\n'));
  issues.push(...dateResult.issues.filter(v=>v.startsWith('date_')||v.startsWith('time_')));
  const cash=lines.some(v=>/เงินสด|เงินทอน|\bCash\b|\bChange\b/i.test(v));
  return {fields:{transactionDate:dateResult.fields.transactionDate,transactionTime:dateResult.fields.transactionTime,amount,description:parseGenericReceipt(header+'\n'+lines.filter(v=>/^(?:ร้านค้า|merchant|recipient|ผู้รับเงิน)\s*:/i.test(v)).join('\n')).fields.description},
    suggestedPaymentMethod:cash?'cash':null,issues,amountCandidates:amount?candidates.filter(v=>v.value===amount):candidates};
}
