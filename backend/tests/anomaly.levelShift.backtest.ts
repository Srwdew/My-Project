// ISSUE-ANOM-1 backtest (method declared before running in docs/ANOMALY_LEVEL_SHIFT_BACKTEST.md). Synthetic only,
// no database. Uses the production screenExpense / amountDirection / detectLevelShift; the baseline is the in-memory
// amount mirror of anomalyBaseline (prior dates, 180 days, flagged-unreviewed rows excluded).
import assert from 'node:assert/strict';
import {shiftDay} from '../src/lib/expenseForecast';
import {ANOMALY_RULE,screenExpense,amountDirection,detectLevelShift,levelShiftStartIndex,amountReady,globalGate,type Direction} from '../src/lib/anomalyRules';
import {amountBaseline} from './forecast.anomalyExclusion';
import {fixture,PROTOCOL} from './forecast.benchmark';
import type {Sample} from './forecast.fixture';

const days=(a:string,b:string)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
export type Mode='off'|'confirm'|'ignore';
type Shift={category:string;direction:Direction;start:string;detectedAt:string;state:'pending'|'confirmed';actedOn:string|null};

/** One fixture under one user behaviour. 'off' = today's system (no detector), the 390 reference. */
export function simulate(rows:Sample[],mode:Mode){
 const order=rows.map((r,i)=>({...r,i})).sort((a,b)=>a.date.localeCompare(b.date)||a.categoryId.localeCompare(b.categoryId)||a.i-b.i);
 const flagged=new Set<number>(),normal=new Set<number>(),hist=new Map<string,{date:string;dir:Direction|null}[]>(),shifts:Shift[]=[];
 const flagsByCategory=new Map<string,number>();let notifications=0;
 for(const r of order){
  const before=order.filter(o=>o.date<r.date);
  if(!globalGate(before.length,before.length?days(before[0]!.date,before.at(-1)!.date)+1:0))continue;
  // (ก)(1): a confirmed shift moves the window start for rows of that category, at both category and account level
  // (baselineSince in anomalyLevelShift.ts).
  const mine=shifts.filter(s=>s.category===r.categoryId);
  const since=mine.filter(s=>s.state==='confirmed'&&s.start<=r.date).map(s=>s.start).sort().pop()??'';
  const lower=[shiftDay(r.date,-ANOMALY_RULE.windowDays),since].sort().pop()!;
  const window=order.filter(o=>o.date<r.date&&o.date>=lower&&(!flagged.has(o.i)||normal.has(o.i)));
  const cat=amountBaseline(window.filter(o=>o.categoryId===r.categoryId)),b=amountReady(cat)?cat:amountBaseline(window);
  const status=screenExpense(r.amount,false,b).amount.status;
  if(status==='not_evaluated')continue;
  const dir=amountDirection(r.amount,b);
  if(status==='flagged'){flagged.add(r.i);flagsByCategory.set(r.categoryId,(flagsByCategory.get(r.categoryId)??0)+1);}
  // Detect before notifying (detectShift runs before the notice in evaluatePending).
  let created:Shift|null=null;
  if(mode!=='off'){
   const h=hist.get(r.categoryId)??hist.set(r.categoryId,[]).get(r.categoryId)!;h.push({date:r.date,dir});
   const d=detectLevelShift(h.map(x=>x.dir)),same=mine.filter(s=>s.direction===d);
   const answered=same.map(s=>s.actedOn??'').sort().pop()??'',fresh=h.filter(x=>x.date>answered);
   if(d&&!same.some(s=>s.state==='pending')&&detectLevelShift(fresh.map(x=>x.dir))===d){
    created={category:r.categoryId,direction:d,start:fresh[levelShiftStartIndex(fresh.map(x=>x.dir),d)]!.date,detectedAt:r.date,state:'pending',actedOn:null};
    shifts.push(created);
    if(d==='up')notifications++; // one shift notice; down shifts are shown in the queue only
   }
  }
  // Per-item notice is held from the shift's start date while an up shift for this category waits (noticeHeld).
  const held=shifts.some(s=>s.category===r.categoryId&&s.direction==='up'&&s.state==='pending'&&s.start<=r.date);
  if(status==='flagged'&&!held)notifications++;
  if(created&&mode==='confirm'){
   created.state='confirmed';created.actedOn=r.date;
   for(const o of order)if(o.categoryId===created.category&&o.date>=created.start&&o.date<=r.date&&flagged.has(o.i))normal.add(o.i);
  }
 }
 const pending=shifts.filter(s=>s.state==='pending');
 const covered=(i:number)=>{const o=order.find(x=>x.i===i)!;return pending.some(s=>s.direction==='up'&&s.category===o.categoryId&&o.date>=s.start);};
 const queue=[...flagged].filter(i=>!normal.has(i)&&!covered(i)).length+pending.length;
 return {flags:flagged.size,queue,notifications,shifts:shifts.map(s=>`${s.category}:${s.direction}:${s.start}`),flagsByCategory:Object.fromEntries(flagsByCategory)};
}

export function run(){
 const out:{scenario:string;mode:Mode;flags:number;queue:number;notifications:number;shifts:string[];flagsByCategory:Record<string,number>}[]=[];
 for(const scenario of PROTOCOL.scenarios)for(const mode of ['off','confirm','ignore'] as const){
  const t={scenario,mode,flags:0,queue:0,notifications:0,shifts:[] as string[],flagsByCategory:{} as Record<string,number>};
  for(const seed of PROTOCOL.seeds){
   const s=simulate(fixture(scenario,seed),mode);
   t.flags+=s.flags;t.queue+=s.queue;t.notifications+=s.notifications;t.shifts.push(...s.shifts.map(x=>seed+':'+x));
   for(const [k,v] of Object.entries(s.flagsByCategory))t.flagsByCategory[k]=(t.flagsByCategory[k]??0)+v;
  }
  out.push(t);
 }
 return out;
}

if(require.main===module){
 // Self-check: the reference mode must reproduce the known 390 level-change flags of the locked screen.
 const r=run(),ref=r.find(x=>x.scenario==='level-change'&&x.mode==='off')!;
 assert.equal(ref.flags,390,'reference reproduces ISSUE-ANOM-1');
 const label={off:'ระบบเดิม (ไม่มีตัวตรวจ)',confirm:'A: ยืนยันทันที',ignore:'B: ไม่ตอบเลย'};
 console.log('| scenario | โหมด | flag | เห็นในคิว (วันสุดท้าย) | แจ้งเตือน | ตรวจพบการขยับ (seed:หมวด:ทิศ:วันเริ่ม) | flag ต่อหมวด |\n|---|---|---|---|---|---|---|');
 for(const x of r)console.log(`| ${x.scenario} | ${label[x.mode]} | ${x.flags} | ${x.queue} | ${x.notifications} | ${x.shifts.length?x.shifts.length+' — '+x.shifts.join(', '):'0'} | ${JSON.stringify(x.flagsByCategory)} |`);
 for(const mode of ['off','confirm','ignore'] as const){const s=r.filter(x=>x.mode===mode);console.log(`| **รวม** | ${label[mode]} | ${s.reduce((a,x)=>a+x.flags,0)} | ${s.reduce((a,x)=>a+x.queue,0)} | ${s.reduce((a,x)=>a+x.notifications,0)} | ${s.reduce((a,x)=>a+x.shifts.length,0)} | |`);}
}
