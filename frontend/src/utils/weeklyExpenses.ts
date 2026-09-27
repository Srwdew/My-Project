export type WeeklyResponse = { period: {startDate:string;endDate:string;dayCount:number}; totalExpense:number; transactionCount:number; weeks: {weekNumber:number;startDate:string;endDate:string;transactionCount:number;totalExpense:number;categories:{categoryId:string;name:string;amount:number;transactionCount:number}[]}[] };
export function weeklyCents(value:number):bigint {
  if(!Number.isFinite(value)||value<0||!Number.isSafeInteger(Math.round(value*100))) throw Error('ยอดเงินเกินขอบเขตที่ API เดิมรองรับ');
  return BigInt(value.toFixed(2).replace('.',''));
}
export const weeklyMoney=(cents:bigint)=> (cents/100n).toString()+'.'+(cents%100n).toString().padStart(2,'0');
export function weeklyView(data:WeeklyResponse,categoryId=''){
  const options=new Map<string,string>();
  const weeks=[...data.weeks].sort((a,b)=>a.startDate.localeCompare(b.startDate)).map(w=>{
    w.categories.forEach(c=>options.set(c.categoryId,c.name));
    const c=w.categories.find(c=>c.categoryId===categoryId);
    return {...w,cents:weeklyCents(categoryId?(c?.amount??0):w.totalExpense),count:categoryId?(c?.transactionCount??0):w.transactionCount};
  });
  return {weeks,total:weeks.reduce((s,w)=>s+w.cents,0n),count:weeks.reduce((s,w)=>s+w.count,0),options:[...options].sort((a,b)=>a[1].localeCompare(b[1]))};
}
