import test from 'node:test';
import assert from 'node:assert/strict';
import {getBudgetTimeline,cycleBounds,getCurrentCycle,cycleByPeriod,cycleContextFromProfile,loadCycleContext,type CycleContext} from '../src/lib/cycle';
import {dashboardPeriod} from '../src/lib/dashboard';
import {lastCompletedMonth} from '../src/lib/goalFeasibility';
import {transactionPeriod} from '../src/lib/budgetNotifications';
const ctx=cycleContextFromProfile('u',null);
// Phase 1 contract: every caller must give exactly what its old inline calendar math gave. Old code copied verbatim below.
const oldTimeline=(year:number,month:number,today:string)=>{
 const [currentYear,currentMonth,currentDay]=today.split('-').map(Number) as [number,number,number];
 const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
 const selectedPeriod=year*12+month,currentPeriod=currentYear*12+currentMonth;
 const monthState=selectedPeriod<currentPeriod?'past':selectedPeriod>currentPeriod?'future':'current';
 const elapsedDays=monthState==='past'?daysInMonth:monthState==='future'?0:currentDay;
 return {monthState,daysInMonth,elapsedDays,expenseCutoff:new Date(Date.UTC(year,month-1,elapsedDays+1))};
};
const oldDashboardDates=(month:string)=>{const startDate=month+'-01';const next=new Date(startDate+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
 return {startDate,calendarEndDate:new Date(next.getTime()-86400000).toISOString().slice(0,10)};};
const oldLastCompleted=(today:string)=>{const end=new Date(today.slice(0,7)+'-01T00:00:00Z');end.setUTCDate(0);const endDate=end.toISOString().slice(0,10);
 return {month:endDate.slice(0,7),startDate:endDate.slice(0,7)+'-01',endDate};};
const oldRemaining=(asOfDate:string)=>{const end=new Date(asOfDate.slice(0,7)+'-01T00:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
 return (Date.parse(end.toISOString().slice(0,10))-Date.parse(asOfDate))/864e5+1;};
const oldCompared=(today:string)=>{const start=new Date(today+'T00:00:00Z');const dim=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();return Math.min(7,dim-start.getUTCDate()+1);};
const dates:string[]=[];for(let t=Date.UTC(2023,11,1);t<=Date.UTC(2029,0,31);t+=864e5)dates.push(new Date(t).toISOString().slice(0,10));

test('cycle phase 1 matches old calendar-month math on every day 2023-12..2029-01',()=>{
 for(const d of dates){
  const c=getCurrentCycle(ctx,d);
  assert.deepEqual(lastCompletedMonth(ctx,d),oldLastCompleted(d),d);
  assert.deepEqual(transactionPeriod(ctx,new Date(d+'T00:00:00Z')),{year:Number(d.slice(0,4)),month:Number(d.slice(5,7))},d);
  const p=dashboardPeriod(ctx,undefined,d),o=oldDashboardDates(d.slice(0,7));
  assert.equal(p.month,d.slice(0,7));assert.equal(p.startDate,o.startDate);assert.equal(p.calendarEndDate,o.calendarEndDate);assert.equal(p.isCurrentMonth,true);
  assert.equal((Date.parse(c.endDate)-Date.parse(d))/864e5+1,oldRemaining(d),d);
  assert.equal(Math.min(7,(Date.parse(c.endDate)-Date.parse(d))/864e5+1),oldCompared(d),d);
  if(d.endsWith('-01')){
   const {start,end}=cycleBounds(c),[y,m]=[c.year,c.month];
   assert.deepEqual([start,end],[new Date(Date.UTC(y,m-1,1)),new Date(Date.UTC(y,m,1))]);
  }
 }
});
test('budget timeline unchanged for past, current and future months',()=>{
 for(const today of dates.filter((_,i)=>i%5===0))for(const off of [-13,-1,0,1,12]){
  const base=Number(today.slice(0,4))*12+Number(today.slice(5,7))-1+off,y=Math.floor(base/12),m=base%12+1;
  const {cycle,...now}=getBudgetTimeline(ctx,y,m,today);
  assert.deepEqual(now,oldTimeline(y,m,today),y+'-'+m+' @'+today);assert.equal(cycle.key,`${y}-${String(m).padStart(2,'0')}`);
 }
});
test('dashboard keeps rejecting future months and accepting past ones',()=>{
 assert.throws(()=>dashboardPeriod(ctx,'2026-11','2026-10-30'));
 const p=dashboardPeriod(ctx,'2024-02','2026-10-30');
 assert.deepEqual([p.startDate,p.calendarEndDate,p.effectiveEndDate,p.isCurrentMonth],['2024-02-01','2024-02-29','2024-02-29',false]);
});
test('dashboard returns backend-owned navigation keys',()=>{
 const pick=(m:string|undefined)=>{const p=dashboardPeriod(ctx,m,'2026-10-30');return [p.month,p.currentMonth,p.previousMonth,p.nextMonth];};
 assert.deepEqual(pick(undefined),['2026-10','2026-10','2026-09',null]);
 assert.deepEqual(pick('2024-12'),['2024-12','2026-10','2024-11','2025-01']);
 assert.deepEqual(pick('2026-09'),['2026-09','2026-10','2026-08','2026-10']);
 assert.deepEqual(pick('0001-01').slice(2),[null,'0001-02']);
});
test('loader picks an explicit calendar reason; phase 1 never issues payday contexts',async()=>{
 const db=(paydayDay:number|null|undefined)=>({profile:{findUnique:async()=>paydayDay===undefined?null:{paydayDay}}});
 const pick=(c:CycleContext)=>c.kind==='calendar'?[c.kind,c.reason,c.userId]:[c.kind];
 assert.deepEqual(pick(await loadCycleContext(db(undefined),'a')),['calendar','no_payday','a']);
 assert.deepEqual(pick(await loadCycleContext(db(null),'b')),['calendar','no_payday','b']);
 assert.deepEqual(pick(await loadCycleContext(db(25),'c')),['calendar','payday_set_not_enabled','c']);
 assert.ok(Object.isFrozen(ctx));
});
test('a missing, malformed or forged context throws at runtime (casts and .cjs bypass the compiler)',()=>{
 const forged={userId:'u',kind:'calendar',reason:'no_payday'} as unknown as CycleContext;
 for(const bad of [undefined,null,'u',42,{},forged] as unknown as CycleContext[])
  assert.throws(()=>getCurrentCycle(bad,'2026-10-30'),/CYCLE_CONTEXT_REQUIRED/);
 assert.throws(()=>cycleByPeriod('u' as unknown as CycleContext,2026,10),/CYCLE_CONTEXT_REQUIRED/);
 assert.throws(()=>dashboardPeriod(forged,undefined,'2026-10-30'),/CYCLE_CONTEXT_REQUIRED/);
 assert.equal(getCurrentCycle(ctx,'2026-10-30').key,'2026-10');
});
