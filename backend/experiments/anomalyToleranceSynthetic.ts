import type {Dataset,Observation} from './anomalyTolerance';
export function syntheticDataset():Dataset{
 const amounts=['105','110','120','126','104','114','124','150'];
 const observations:Observation[]=amounts.map((amount,i)=>({account:'synthetic-a',transaction:'tx-'+i,revision:1,currentRevision:1,category:'category-a',dimension:'amount',evaluation:'evaluation-'+i,amount,action:i<4?'recurring':'occasional',patternId:i<4?'pattern-a':null,decidedAt:'2026-10-03T00:00:00.000Z',sequence:1,id:'decision-'+i}));
 return {source:'synthetic',since:'2026-10-01T00:00:00.000Z',asOf:'2026-10-05T00:00:00.000Z',accounts:['synthetic-a'],patterns:[{account:'synthetic-a',id:'pattern-a',category:'category-a',dimension:'amount',createdAt:'2026-10-02T00:00:00.000Z',referenceMedian:'100.00',founderEvaluations:['founder'],founderAmounts:['100.00']}],observations,labels:observations.filter((_,i)=>i>=4).map(o=>({account:o.account,patternId:'pattern-a',transaction:o.transaction,revision:1,dimension:'amount',decisionId:o.id,samePattern:false}))};
}
