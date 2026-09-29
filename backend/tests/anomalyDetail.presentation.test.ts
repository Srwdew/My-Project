import test from 'node:test';
import assert from 'node:assert/strict';
import {assessmentLabel,currentAssessmentLabel,evaluationChoices,amountFormula,type AnomalyDetail,type Evaluation} from '../../frontend/src/utils/anomalyPresentation';
const evaluation={id:'one',revision:1,outcome:'not_evaluated',snapshot:{assessment:{amount:{status:'not_evaluated',reasonCode:'amount_insufficient_history'},time:{status:'not_evaluated',reasonCode:'time_not_confirmed'}},rules:{zScale:'0.6745',zThreshold:'3.5',iqrMultiplier:'3',minimumDifference:'100',medianDifferenceRatio:'0.5'}}} as Evaluation;
const detail={currentRevision:1,sourceState:'unchanged',pending:false,notificationSnapshot:null,latestEvaluation:null,latestAppliesToCurrent:false} as AnomalyDetail;
test('presentation separates no evaluation, pending, insufficient, unassessable and nonflagged',()=>{
 assert.equal(currentAssessmentLabel(detail),'ยังไม่ตรวจ');
 assert.equal(currentAssessmentLabel({...detail,pending:true}),'รอประเมิน');
 assert.equal(currentAssessmentLabel({...detail,latestEvaluation:evaluation,latestAppliesToCurrent:true}),'ข้อมูลไม่พอ');
 assert.equal(assessmentLabel({status:'not_evaluated',reasonCode:'amount_zero_iqr_nonconstant'}),'ยังประเมินไม่ได้');
 assert.equal(assessmentLabel({status:'not_flagged',reasonCode:'amount_modified_z'}),'ไม่พบสัญญาณ');
 assert.equal(assessmentLabel({status:'flagged',reasonCode:'amount_modified_z'}),'พบสัญญาณ');
 assert.equal(currentAssessmentLabel({...detail,sourceState:'deleted'}),'รายการต้นทางถูกลบแล้ว');
});
test('same evaluation displayed once; distinct evaluations remain selectable even within same revision',()=>{
 assert.equal(evaluationChoices({...detail,notificationSnapshot:evaluation,latestEvaluation:evaluation}).length,1);
 assert.equal(evaluationChoices({...detail,notificationSnapshot:evaluation,latestEvaluation:{...evaluation,id:'two'}}).length,2);
});
test('only actual amount methods get formulas; no fabricated formula for insufficient or mixed zero IQR',()=>{
 assert.equal(amountFormula(evaluation),null);
 for(const reason of ['amount_zero_iqr_nonconstant','future_unknown_reason'])assert.equal(amountFormula({...evaluation,snapshot:{...evaluation.snapshot,assessment:{...evaluation.snapshot.assessment,amount:{status:'not_evaluated',reasonCode:reason}}}}),null);
 for(const [reason,expected,absent] of [['amount_zero_dispersion','X > median','Z ='],['amount_iqr','Q3','Z ='],['amount_modified_z','Z =','Q3']]){
 const result=amountFormula({...evaluation,snapshot:{...evaluation.snapshot,assessment:{...evaluation.snapshot.assessment,amount:{status:'flagged',reasonCode:reason}}}})!;
 assert.ok(result.includes(expected!));assert.ok(!result.includes(absent!));
 }
});

test('modified Z formula includes scale, MAD, strict threshold and minimum difference',()=>{
 const e={...evaluation,snapshot:{...evaluation.snapshot,assessment:{...evaluation.snapshot.assessment,amount:{status:'flagged',reasonCode:'amount_modified_z'}}}};
 assert.equal(amountFormula(e),'Z = 0.6745 × (X − median) / MAD; Z > 3.5 และ X − median > max(100 บาท, 0.5 × median)');
});
