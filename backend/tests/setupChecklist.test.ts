import test from 'node:test';
import assert from 'node:assert/strict';
import {setupDraft,setupPayload,FINANCIAL_INTENTIONS,type SetupSettings} from '../../frontend/src/utils/setupChecklist';
const empty:SetupSettings={userId:'a',displayName:null,income:null,paydayDay:null,budgetMonth:'2026-10',budgetAmount:null,primaryGoalId:null,legacyGoal:null,notifications:{notifyNearLimit:false,notifyExceeded:false,notifyAnomaly:false}};
test('new user, uncertain payday and optional financial intention',()=>{
 const draft=setupDraft(empty);assert.equal(draft.paydayDay,'');draft.displayName='New';draft.income='0.07';draft.intention=FINANCIAL_INTENTIONS[0];
 assert.deepEqual(setupPayload(empty,empty,draft),{completeSetup:true,displayName:'New',income:'0.07',paydayDay:null,budgetMonth:'2026-10',budgetAmount:null,primaryGoalId:null,notifyNearLimit:false,notifyExceeded:false,financialIntention:FINANCIAL_INTENTIONS[0]});
});
test('prefill and untouched fields preserve latest name, budget, primary goal, income and payday',()=>{
 const old={...empty,displayName:'Old name',income:'25000.00',paydayDay:25,budgetAmount:'9000.00',primaryGoalId:'g1',legacyGoal:'old free text'};
 const draft=setupDraft(old);draft.intention=FINANCIAL_INTENTIONS[2];draft.displayName='do not overwrite';
 const latest={...old,displayName:'Latest name',income:'26000.00',paydayDay:26,budgetAmount:'9500.00',primaryGoalId:'g2',notifications:{...old.notifications,notifyNearLimit:true}};
 const p=setupPayload(old,latest,draft);assert.equal(p.displayName,'Latest name');assert.equal(p.income,'26000.00');assert.equal(p.paydayDay,26);assert.equal(p.budgetAmount,'9500.00');assert.equal(p.primaryGoalId,'g2');assert.equal(p.notifyNearLimit,true);assert.equal('notifyAnomaly' in p,false);
});
test('blank money preserves existing values; untouched legacy intention is omitted',()=>{
 const s={...empty,displayName:'Name',income:'10.00',budgetAmount:'123.45',legacyGoal:'custom old intention'};const d=setupDraft(s);d.income=' ';d.budgetAmount='';
 const p=setupPayload(s,s,d);assert.equal(p.income,'10.00');assert.equal(p.budgetAmount,'123.45');assert.equal('financialIntention' in p,false);
});
test('explicit uncertain payday persists null',()=>{const s={...empty,displayName:'Name',paydayDay:31};assert.equal(setupPayload(s,s,{...setupDraft(s),paydayDay:''}).paydayDay,null);});
test('invalid money, name, payday, intention, cross-session and month change reject',()=>{
 const s={...empty,displayName:'Name'},d=setupDraft(s);
 for(const change of [{income:'-1'},{income:'0.001'},{income:'10000000000'},{budgetAmount:'0'},{budgetAmount:'1e3'},{paydayDay:'32'},{paydayDay:'1.5'},{intention:'unknown'}])assert.throws(()=>setupPayload(s,s,{...d,...change}));
 assert.throws(()=>setupPayload(empty,empty,setupDraft(empty)));
 assert.throws(()=>setupPayload(s,{...s,userId:'b'},d));assert.throws(()=>setupPayload(s,{...s,budgetMonth:'2026-11'},d));
});
