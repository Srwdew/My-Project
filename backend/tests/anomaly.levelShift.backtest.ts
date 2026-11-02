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
// 'confirm-primary': only the `primary` category's shifts are confirmed (isolates its window cut from other categories).
export type Mode='off'|'confirm'|'ignore'|'confirm-primary';
// resumedAfter: days from the shift's start until the category's amount is evaluated again after confirmation
// (the "silent period": post-shift history below the per-category minimum, so nothing is screened).
type Shift={category:string;direction:Direction;start:string;detectedAt:string;state:'pending'|'confirmed';actedOn:string|null;resumedAfter?:number};

/** One fixture under one user behaviour. 'off' = today's system (no detector), the 390 reference. */
// Per-category amount minimum; default = current ANOMALY_RULE. The stage-1 minimum (30/10/28) is replayed by treating a
// baseline below it as not ready (screenExpense's own check is the lower 10/5/14, which 30/10/28 always satisfies).
export type Minimum={n:number;days:number;span:number};
export const STAGE1_MIN:Minimum={n:30,days:10,span:28};
export function simulate(rows:Sample[],mode:Mode,min:Minimum={n:ANOMALY_RULE.amountMin,days:ANOMALY_RULE.amountDays,span:ANOMALY_RULE.amountSpan}){
 const ready=(b:ReturnType<typeof amountBaseline>)=>amountReady(b)&&b.n>=min.n&&b.days>=min.days&&b.span>=min.span;
 const order=rows.map((r,i)=>({...r,i})).sort((a,b)=>a.date.localeCompare(b.date)||a.categoryId.localeCompare(b.categoryId)||a.i-b.i);
 const flagged=new Set<number>(),normal=new Set<number>(),hist=new Map<string,{date:string;dir:Direction|null}[]>(),shifts:Shift[]=[];
 const flagsByCategory=new Map<string,number>(),ownScope=new Map<string,number>();let notifications=0;const medians:{date:string;median:number}[]=[];
 for(const r of order){
  const before=order.filter(o=>o.date<r.date);
  if(!globalGate(before.length,before.length?days(before[0]!.date,before.at(-1)!.date)+1:0))continue;
  // (ก)(1): a confirmed shift moves the window start for rows of that category, at both category and account level
  // (baselineSince in anomalyLevelShift.ts).
  const mine=shifts.filter(s=>s.category===r.categoryId);
  const since=mine.filter(s=>s.state==='confirmed'&&s.start<=r.date).map(s=>s.start).sort().pop()??'';
  const lower=[shiftDay(r.date,-ANOMALY_RULE.windowDays),since].sort().pop()!;
  const window=order.filter(o=>o.date<r.date&&o.date>=lower&&(!flagged.has(o.i)||normal.has(o.i)));
  const cat=amountBaseline(window.filter(o=>o.categoryId===r.categoryId)),b=ready(cat)?cat:amountBaseline(window);
  const status=ready(b)?screenExpense(r.amount,false,b).amount.status:'not_evaluated';
  if(status==='not_evaluated')continue;
  medians.push({date:r.date,median:Number(b.median)});
  for(const s of mine)if(s.state==='confirmed'&&s.resumedAfter===undefined&&r.date>s.actedOn!)s.resumedAfter=days(s.start,r.date);
  const dir=amountDirection(r.amount,b);
  if(status==='flagged'){flagged.add(r.i);flagsByCategory.set(r.categoryId,(flagsByCategory.get(r.categoryId)??0)+1);}
  if(b===cat)ownScope.set(r.categoryId,(ownScope.get(r.categoryId)??0)+1);
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
  if(created&&(mode==='confirm'||mode==='confirm-primary'&&created.category==='primary')){
   created.state='confirmed';created.actedOn=r.date;
   for(const o of order)if(o.categoryId===created.category&&o.date>=created.start&&o.date<=r.date&&flagged.has(o.i))normal.add(o.i);
  }
 }
 const pending=shifts.filter(s=>s.state==='pending');
 const covered=(i:number)=>{const o=order.find(x=>x.i===i)!;return pending.some(s=>s.direction==='up'&&s.category===o.categoryId&&o.date>=s.start);};
 const queue=[...flagged].filter(i=>!normal.has(i)&&!covered(i)).length+pending.length;
 return {flags:flagged.size,queue,notifications,shifts:shifts.map(s=>`${s.category}:${s.direction}:${s.start}`),flagsByCategory:Object.fromEntries(flagsByCategory),ownScope:Object.fromEntries(ownScope),medians,silent:shifts.filter(s=>s.state==='confirmed').map(s=>s.resumedAfter??null)};
}

/** Not in the locked forecast fixture: a permanent drop (e.g. a cancelled subscription), 400 → 150 baht from day 150. */
export const DOWN_AT=150;
export function levelDown(seed:number):Sample[]{
 let state=seed>>>0;const next=()=>state=(Math.imul(1664525,state)+1013904223)>>>0;
 return Array.from({length:PROTOCOL.days},(_,i)=>({categoryId:'primary',date:shiftDay(PROTOCOL.start,i),amount:((i<DOWN_AT?40000:15000)+next()%2001-1000)/100+'',count:1}));
}
/** Several categories, declared before running (docs/ANOMALY_LEVEL_SHIFT_BACKTEST.md): only `primary` shifts (100 →
 *  250 baht from day 150, every day). The others never change level, so any flag or shift in them is a false one.
 *  Spacing puts their 180-day history just above 10/5/14 (edge, every 16 days ≈ 11 items), between 10/5/14 and
 *  30/10/28 (mid, every 8 days ≈ 22 items) and below 10/5/14 (sparse, every 30 days ≈ 6 items). Amounts vary
 *  ±25% uniformly around their own level, as everyday spending does. */
export const MULTI={primary:{every:1,level:100},edge:{every:16,level:300},mid:{every:8,level:80},sparse:{every:30,level:500}} as const;
export function multiCategory(seed:number):Sample[]{
 let state=seed>>>0;const next=()=>state=(Math.imul(1664525,state)+1013904223)>>>0;const rows:Sample[]=[];
 for(let i=0;i<PROTOCOL.days;i++)for(const [categoryId,c] of Object.entries(MULTI)){
  if((i+seed)%c.every!==0)continue;
  const level=categoryId==='primary'&&i>=150?250:c.level,noise=(next()%5001)/10000-0.25;
  rows.push({categoryId,date:shiftDay(PROTOCOL.start,i),amount:(Math.round(level*(1+noise)*100)/100).toFixed(2),count:1});
 }
 return rows;
}
/** Days after the drop until the amount baseline's median is closer to the new level than the old (below 275). */
export function daysToFollow(medians:{date:string;median:number}[]){
 const at=medians.find(m=>m.date>=shiftDay(PROTOCOL.start,DOWN_AT)&&m.median<275);
 return at?days(shiftDay(PROTOCOL.start,DOWN_AT),at.date):null;
}

export function run(){
 const out:{scenario:string;mode:Mode;flags:number;queue:number;notifications:number;shifts:string[];flagsByCategory:Record<string,number>;silent:(number|null)[]}[]=[];
 for(const scenario of PROTOCOL.scenarios)for(const mode of ['off','confirm','ignore'] as const){
  const t={scenario,mode,flags:0,queue:0,notifications:0,shifts:[] as string[],flagsByCategory:{} as Record<string,number>,silent:[] as (number|null)[]};
  for(const seed of PROTOCOL.seeds){
   const s=simulate(fixture(scenario,seed),mode);
   t.flags+=s.flags;t.queue+=s.queue;t.notifications+=s.notifications;t.shifts.push(...s.shifts.map(x=>seed+':'+x));t.silent.push(...s.silent);
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
 const label={off:'ระบบเดิม (ไม่มีตัวตรวจ)',confirm:'A: ยืนยันทันที','confirm-primary':'A เฉพาะ primary',ignore:'B: ไม่ตอบเลย'};
 console.log('| scenario | โหมด | flag | เห็นในคิว (วันสุดท้าย) | แจ้งเตือน | ตรวจพบการขยับ (seed:หมวด:ทิศ:วันเริ่ม) | flag ต่อหมวด | ช่วงเงียบหลังยืนยัน (วันจากวันเริ่ม) |\n|---|---|---|---|---|---|---|---|');
 for(const x of r)console.log(`| ${x.scenario} | ${label[x.mode]} | ${x.flags} | ${x.queue} | ${x.notifications} | ${x.shifts.length?x.shifts.length+' — '+x.shifts.join(', '):'0'} | ${JSON.stringify(x.flagsByCategory)} | ${x.silent.length?x.silent.map(v=>v??'ไม่กลับมาประเมินภายในข้อมูล').join(', '):'—'} |`);
 for(const mode of ['off','confirm','ignore'] as const){const s=r.filter(x=>x.mode===mode);console.log(`| **รวม** | ${label[mode]} | ${s.reduce((a,x)=>a+x.flags,0)} | ${s.reduce((a,x)=>a+x.queue,0)} | ${s.reduce((a,x)=>a+x.notifications,0)} | ${s.reduce((a,x)=>a+x.shifts.length,0)} | |`);}
 console.log('\n### หลายหมวด (primary ขยับ, หมวดรองไม่ขยับ: flag/ตรวจพบในหมวดรอง = ผิด)\n| ขั้นต่ำ | โหมด | flag ต่อหมวด (รวม 3 seeds) | แจ้งเตือน | ตรวจพบ (หมวด:ทิศ) | ครั้งที่ใช้ baseline ของหมวดเอง |\n|---|---|---|---|---|---|');
 for(const [name,min] of [['30/10/28',STAGE1_MIN],['10/5/14',{n:ANOMALY_RULE.amountMin,days:ANOMALY_RULE.amountDays,span:ANOMALY_RULE.amountSpan}]] as const)for(const mode of ['off','confirm-primary','confirm','ignore'] as const){
  const f:Record<string,number>={},own:Record<string,number>={};let n=0;const sh:string[]=[];
  for(const seed of PROTOCOL.seeds){const s=simulate(multiCategory(seed),mode,min);n+=s.notifications;sh.push(...s.shifts.map(x=>x.split(':').slice(0,2).join(':')));for(const [k,v] of Object.entries(s.flagsByCategory))f[k]=(f[k]??0)+v;for(const [k,v] of Object.entries(s.ownScope))own[k]=(own[k]??0)+v;}
  console.log(`| ${name} | ${label[mode]} | ${Object.keys(MULTI).map(k=>k+' '+(f[k]??0)).join(' · ')} | ${n} | ${sh.length?sh.join(', '):'0'} | ${Object.keys(MULTI).map(k=>k+' '+(own[k]??0)).join(' · ')} |`);
 }
 console.log('\n### ขาลง (400 → 150 บาท จากวันที่ 150)\n| seed | โหมด | flag | เห็นในคิว | แจ้งเตือน | ตรวจพบ | วันที่ baseline ตามระดับใหม่ (มัธยฐาน < 275) | ช่วงเงียบหลังยืนยัน |\n|---|---|---|---|---|---|---|---|');
 for(const seed of PROTOCOL.seeds)for(const mode of ['off','confirm','ignore'] as const){const s=simulate(levelDown(seed),mode);console.log(`| ${seed} | ${label[mode]} | ${s.flags} | ${s.queue} | ${s.notifications} | ${s.shifts.join(', ')||'0'} | ${daysToFollow(s.medians)??'ไม่ตามภายในข้อมูล'} | ${s.silent.map(v=>v??'—').join(', ')||'—'} |`);}
}
