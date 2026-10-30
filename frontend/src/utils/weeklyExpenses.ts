export type WeeklyResponse = { period: {startDate:string;endDate:string;dayCount:number}; totalExpense:number; transactionCount:number; weeks: {weekNumber:number;startDate:string;endDate:string;transactionCount:number;totalExpense:number;categories:{categoryId:string;name:string;amount:number;transactionCount:number}[]}[] };
export function weeklyCents(value:number):bigint {
  if(!Number.isFinite(value)||value<0||!Number.isSafeInteger(Math.round(value*100))) throw Error('ยอดเงินเกินขอบเขตที่ API เดิมรองรับ');
  return BigInt(value.toFixed(2).replace('.',''));
}
export const weeklyMoney=(cents:bigint)=> (cents/100n).toString()+'.'+(cents%100n).toString().padStart(2,'0');
// Weekly range rules: Monday–Sunday full weeks that have already ended (ISO day keys, UTC math).
const dayMs=86_400_000;
export const addDays=(key:string,n:number)=>new Date(Date.parse(key+'T00:00:00Z')+n*dayMs).toISOString().slice(0,10);
const dow=(key:string)=>new Date(key+'T00:00:00Z').getUTCDay();
export const isMonday=(key:string)=>dow(key)===1;
export const isSunday=(key:string)=>dow(key)===0;
// Sunday that closes the most recent week finished before today (today itself never counts).
export const lastClosedSunday=(today:string)=>addDays(today,-(dow(today)||7));
// Default: the 4 full weeks ending on the last closed Sunday within the chosen month (or before it).
export function defaultWeekRange(month:string,today:string){
  const monthEnd=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).toISOString().slice(0,10);
  const cap=monthEnd<lastClosedSunday(today)?monthEnd:lastClosedSunday(today);
  const end=addDays(cap,-dow(cap));
  return {start:addDays(end,-27),end};
}
export function weeklyView(data:WeeklyResponse,categoryId=''){
  const options=new Map<string,string>();
  const weeks=[...data.weeks].sort((a,b)=>a.startDate.localeCompare(b.startDate)).map(w=>{
    w.categories.forEach(c=>options.set(c.categoryId,c.name));
    const c=w.categories.find(c=>c.categoryId===categoryId);
    return {...w,cents:weeklyCents(categoryId?(c?.amount??0):w.totalExpense),count:categoryId?(c?.transactionCount??0):w.transactionCount};
  });
  return {weeks,total:weeks.reduce((s,w)=>s+w.cents,0n),count:weeks.reduce((s,w)=>s+w.count,0),options:[...options].sort((a,b)=>a[1].localeCompare(b[1]))};
}
