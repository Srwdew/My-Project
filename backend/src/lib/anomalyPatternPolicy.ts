export const CADENCES={weekly:{days:7,grace:2},fortnightly:{days:14,grace:3},monthly:{months:1,grace:5},quarterly:{months:3,grace:7},half_yearly:{months:6,grace:10},yearly:{months:12,grace:14}} as const;
export type Cadence=keyof typeof CADENCES;
const date=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Invalid calendar date');const d=new Date(s+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error('Invalid calendar date');return d;};
const iso=(d:Date)=>d.toISOString().slice(0,10);
export function dueDate(anchor:string,cadence:Cadence,cycle:number){
 if(!Number.isInteger(cycle)||cycle<0)throw Error('Invalid cycle');
 const d=date(anchor),c=CADENCES[cadence];if('days'in c){d.setUTCDate(d.getUTCDate()+cycle*c.days);return iso(d);}
 const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+cycle*c.months);
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return iso(d);
}
export function withinCadence(anchor:string,candidate:string,cadence:Cadence,cycle=1){return Math.abs(date(candidate).getTime()-date(dueDate(anchor,cadence,cycle)).getTime())/86400000<=CADENCES[cadence].grace;}
export function cadenceCandidates(dates:string[]){if(dates.length<3)return [];const ds=[...new Set(dates)].sort();if(ds.length<3)return [];return (Object.keys(CADENCES) as Cadence[]).filter(c=>withinCadence(ds[0]!,ds[1]!,c,1)&&withinCadence(ds[1]!,ds[2]!,c,1));}
export function missedCycles(anchor:string,cadence:Cadence,asOf:string,lastOccurrence=anchor){
 const now=date(asOf).getTime(),a=date(anchor),last=date(lastOccurrence),c=CADENCES[cadence];
 const elapsed='days'in c?(last.getTime()-a.getTime())/86400000/c.days:((last.getUTCFullYear()-a.getUTCFullYear())*12+last.getUTCMonth()-a.getUTCMonth())/c.months;
 const covered=Math.max(0,Math.round(elapsed));let missed=0;
 // Only the first four consecutive missing cycles affect lifecycle.
 for(let i=1;i<=4;i++){if(now>date(dueDate(anchor,cadence,covered+i)).getTime()+CADENCES[cadence].grace*86400000)missed=i;else break;}return missed;
}
export function patternStatus(anchor:string,cadence:Cadence,asOf:string,lastOccurrence=anchor){const n=missedCycles(anchor,cadence,asOf,lastOccurrence);return n>=4?'expired':n>=2?'paused':'active';}

import {Prisma} from '@prisma/client';
export function withinPatternAmount(amount:string,referenceMedian:string,absoluteFloorInBaht:string|null):boolean|null{
 if(absoluteFloorInBaht===null)return null; // Disabled, never a guessed floor.
 const x=new Prisma.Decimal(amount),m=new Prisma.Decimal(referenceMedian),floor=new Prisma.Decimal(absoluteFloorInBaht);
 if(!x.isFinite()||!m.isFinite()||!floor.isFinite()||x.lte(0)||m.lte(0)||floor.lt(0))throw Error('Invalid pattern money');
 return x.minus(m).abs().lte(Prisma.Decimal.max(m.mul('0.15'),floor));
}
export type Occurrence={transactionId:string;revision:number;categoryId:string;amount:string;date:string;confirmedValid:boolean};
export function irregularCandidate(rows:Occurrence[],categoryId:string,referenceMedian:string,floor:string|null,asOf:string){
 if(floor===null)return {enabled:false,count:0,candidate:false,offer:false};
 const end=date(asOf).getTime(),start=end-89*86400000;
 const newest=new Map<string,Occurrence>();
 for(const row of rows){if(!newest.has(row.transactionId)||newest.get(row.transactionId)!.revision<row.revision)newest.set(row.transactionId,row);}
 const matching=[...newest.values()].filter(r=>r.categoryId===categoryId&&r.confirmedValid&&date(r.date).getTime()>=start&&date(r.date).getTime()<=end&&withinPatternAmount(r.amount,referenceMedian,floor)).sort((a,b)=>a.date.localeCompare(b.date));
 const regular=matching.some((_,i)=>i>=2&&cadenceCandidates(matching.slice(i-2,i+1).map(r=>r.date)).length>0);
 return {enabled:true,count:matching.length,candidate:!regular&&matching.length>=3,offer:!regular&&matching.length>=5};
}
