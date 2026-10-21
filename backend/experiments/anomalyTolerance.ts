import {Prisma} from '@prisma/client';
export const TOLERANCES=[5,10,15,20,25] as const;
export type Pattern={account:string;id:string;category:string;dimension:'amount'|'time';createdAt:string;referenceMedian:string;founderEvaluations:string[];founderAmounts:string[]};
export type Observation={account:string;transaction:string;revision:number;currentRevision:number|null;category:string;dimension:'amount'|'time';evaluation:string;amount:string;action:string;patternId:string|null;decidedAt:string;sequence:number;id:string};
export type PairLabel={account:string;patternId:string;transaction:string;revision:number;dimension:'amount';decisionId:string;samePattern:boolean};
export type Dataset={source:'synthetic'|'authorized-test-decisions';since:string;asOf:string;accounts:string[];patterns:Pattern[];observations:Observation[];labels:PairLabel[]};
const date=(s:string)=>{const n=Date.parse(s);if(!Number.isFinite(n))throw Error('Invalid date');return n;};
const money=(s:string)=>{const n=new Prisma.Decimal(s);if(!n.isFinite()||n.lte(0))throw Error('Positive finite amount required');return n;};
export function matches(amount:string,reference:string,tolerance:number){if(!TOLERANCES.includes(tolerance as typeof TOLERANCES[number]))throw Error('Unsupported tolerance');const m=money(reference);return money(amount).minus(m).abs().lte(m.mul(tolerance).div(100));}
export function experiment(input:Dataset){
 const from=date(input.since),to=date(input.asOf);if(from>to)throw Error('Invalid interval');
 const allowed=new Set(input.accounts);if(allowed.size!==input.accounts.length)throw Error('Duplicate account');
 const observations=new Map<string,Observation>();
 const skipped={outsideConsent:0,oldOrDeletedRevision:0,wrongDimension:0};
 for(const o of input.observations){
  if(!allowed.has(o.account))throw Error('Account outside authorization');
  if(date(o.decidedAt)<from||date(o.decidedAt)>to){skipped.outsideConsent++;continue;}
  if(o.currentRevision!==o.revision){skipped.oldOrDeletedRevision++;continue;}
  if(o.dimension!=='amount'){skipped.wrongDimension++;continue;}
  money(o.amount);const key=JSON.stringify([o.account,o.transaction,o.revision,o.dimension]);
  const old=observations.get(key);
  if(old?.sequence===o.sequence&&old.id!==o.id)throw Error('Conflicting decision sequence');
  if(!old||o.sequence>old.sequence)observations.set(key,o);
 }
 const labels=new Map<string,PairLabel>();
 for(const l of input.labels){
  if(!allowed.has(l.account))throw Error('Label account outside authorization');
  const key=JSON.stringify([l.account,l.patternId,l.transaction,l.revision,l.dimension,l.decisionId]);
  if(labels.has(key))throw Error('Duplicate pair label');labels.set(key,l);
 }
 const accounts=input.accounts.map((account,index)=>({key:account,alias:'account-'+(index+1)}));
 let patternIndex=0;
 const patterns=input.patterns.filter(p=>{
  if(!allowed.has(p.account))throw Error('Pattern account outside authorization');
  return p.dimension==='amount'&&date(p.createdAt)>=from&&date(p.createdAt)<=to;
 }).map(p=>{
  money(p.referenceMedian);if(!p.founderEvaluations.length||p.founderAmounts.length!==p.founderEvaluations.length)throw Error('Missing founding reference');
  const amounts=p.founderAmounts.map(money).sort((a,b)=>a.comparedTo(b));const middle=Math.floor(amounts.length/2);const median=amounts.length%2?amounts[middle]!:amounts[middle-1]!.plus(amounts[middle]!).div(2);if(!median.eq(p.referenceMedian))throw Error('Reference differs from founding median');
  const cases:{amount:string;truth:boolean|null}[]=[];let excludedFounders=0;
  for(const o of observations.values()){
   if(o.account!==p.account||o.category!==p.category)continue;
   if(p.founderEvaluations.includes(o.evaluation)){excludedFounders++;continue;}
   if(date(o.decidedAt)<=date(p.createdAt))continue;
   const key=JSON.stringify([o.account,p.id,o.transaction,o.revision,o.dimension,o.id]);
   const explicit=labels.get(key);
   const member=o.action==='recurring'&&o.patternId===p.id;
   if(member&&explicit?.samePattern===false)throw Error('Contradictory pattern membership');
   // A normal/problem/occasional decision or another pattern ID alone is NOT a pair-negative label.
   const truth=explicit?.samePattern??(member?true:null);
   cases.push({amount:o.amount,truth});
  }
  const positives=cases.filter(c=>c.truth===true).length,negatives=cases.filter(c=>c.truth===false).length;
  const unknown=cases.filter(c=>c.truth===null).length;
  const rows=TOLERANCES.map(tolerance=>{
   let correctMatch=0,falseMatch=0,falseMiss=0,correctRejection=0;
   for(const c of cases){if(c.truth===null)continue;const m=matches(c.amount,p.referenceMedian,tolerance);if(c.truth){if(m)correctMatch++;else falseMiss++;}else if(m)falseMatch++;else correctRejection++;}
   return {tolerance,correctMatch:positives?correctMatch:null,falseMatch:negatives?falseMatch:null,falseMiss:positives?falseMiss:null,correctRejection:negatives?correctRejection:null,samples:positives+negatives};
  });
  return {account:accounts.find(a=>a.key===p.account)!.alias,pattern:'pattern-'+(++patternIndex),referenceMedian:money(p.referenceMedian).toFixed(2),positiveSamples:positives,negativeSamples:negatives,unknownSamples:unknown,excludedFounders,status:positives&&negatives?'descriptive_only':'insufficient_data',conclusion:'ยังสรุปไม่ได้',rows};
 });
 return {version:'anomaly-amount-tolerance-offline-v1',source:input.source,since:input.since,asOf:input.asOf,automaticMatching:false,absoluteFloorInBaht:null,recommendedTolerance:null,conclusion:'ยังสรุปไม่ได้',comparisonUnit:'pattern / current transaction revision / amount dimension',cadenceEvaluated:false,collection:{inputDecisionEvents:input.observations.length,currentAmountDecisions:observations.size,eligibleAmountPatterns:patterns.length},skipped,accounts:accounts.map(a=>({account:a.alias,patterns:patterns.filter(p=>p.account===a.alias)})),patterns};
}
export function markdown(r:ReturnType<typeof experiment>){
 const lines=['# Amount-pattern tolerance experiment','',`Source: ${r.source}`,`${r.source==='synthetic'?'Synthetic scenario window':'Consent window'}: ${r.since} through ${r.asOf}`,'','Automatic matching: DISABLED. No recommended tolerance. No absolute floor applied.','Conclusion: ยังสรุปไม่ได้',`Input decision events: ${r.collection.inputDecisionEvents}; current amount decisions: ${r.collection.currentAmountDecisions}; eligible amount patterns: ${r.collection.eligibleAmountPatterns}.`,'This report measures amount proximity only, not full cadence matching. Counts are descriptive; correlated pattern/account observations are not independent.',''];
 for(const account of r.accounts){
  lines.push('## '+account.account,'');
  if(!account.patterns.length){lines.push('ยังสรุปไม่ได้ — no eligible post-consent amount patterns.','');continue;}
  for(const p of account.patterns){
   lines.push('### '+p.pattern,'',`Fixed founding median: ${p.referenceMedian}; positive labels: ${p.positiveSamples}; negative labels: ${p.negativeSamples}; unknown: ${p.unknownSamples}; excluded founders: ${p.excludedFounders}.`,`Status: ${p.status}. ยังสรุปไม่ได้.`,'','| Range | Correct match | False match | False miss | Correct rejection | Labeled pairs |','| --- | ---: | ---: | ---: | ---: | ---: |');
   for(const x of p.rows)lines.push(`| ±${x.tolerance}% | ${x.correctMatch??'ยังสรุปไม่ได้'} | ${x.falseMatch??'ยังสรุปไม่ได้'} | ${x.falseMiss??'ยังสรุปไม่ได้'} | ${x.correctRejection??'ยังสรุปไม่ได้'} | ${x.samples} |`);
   lines.push('');
  }
 }
 return lines.join('\n')+'\n';
}
