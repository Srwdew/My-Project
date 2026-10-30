// Synthetic/test-only aggregation. Production aggregation is PostgreSQL GROUP BY date.
import { D,money } from '../src/lib/holt';
import { shiftDay,type ForecastRow,type ForecastInput } from '../src/lib/expenseForecast';
export type Sample=ForecastRow&{categoryId?:string};
export function fixtureInput(rows:Sample[],asOfDate:string,budgetAmount:string|null=null):ForecastInput{
 const cutoff=shiftDay(asOfDate,-1),history=rows.filter(r=>r.date<=cutoff&&r.count>0).sort((a,b)=>a.date.localeCompare(b.date));
 const daily=new Map<string,ForecastRow>();
 for(const r of rows){const prev=daily.get(r.date);daily.set(r.date,{date:r.date,amount:money(new D(prev?.amount??0).plus(r.amount)),count:(prev?.count??0)+r.count});}
 return {userId:'fixture',asOfDate,budgetAmount,rows:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),
 history:{transactionCount:history.reduce((n,r)=>n+r.count,0),firstDate:history[0]?.date??null,lastDate:history.at(-1)?.date??null}};
}
export const history=(n=30,end='2026-09-27',amount='100.00'):Sample[]=>Array.from({length:n},(_,i)=>({date:shiftDay(end,i-n+1),amount,count:1}));
