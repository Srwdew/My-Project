import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {experiment,markdown} from './anomalyTolerance';
import {readDataset,type Scope} from './anomalyToleranceRead';
import {syntheticDataset} from './anomalyToleranceSynthetic';
export async function main(args:string[]){
 const demo=args[0]==='--synthetic';if((demo&&args.length!==3)||(!demo&&(args.length!==4||args[0]!=='--scope'))||args[demo?1:2]!=='--out')throw Error('Use --synthetic --out NEW-DIRECTORY or --scope LOCAL-SCOPE.json --out NEW-DIRECTORY');
 if(!demo)throw Error('Authorized-data export disabled pending retention and consent rollout');
 const dir=resolve(args[demo?2:3]!);if(existsSync(dir))throw Error('Output directory must be new; prior reports are never overwritten');
 const scope=demo?null:JSON.parse(readFileSync(resolve(args[1]!),'utf8')) as Scope;
 const result=experiment(demo?syntheticDataset():await readDataset(process.env.DATABASE_URL??'',scope!));
 mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'report.json'),JSON.stringify(result,null,2),{flag:'wx'});writeFileSync(join(dir,'report.md'),markdown(result),{flag:'wx'});
 console.log(JSON.stringify({source:result.source,accounts:result.accounts.length,patterns:result.patterns.length,output:dir,automaticMatching:false,conclusion:result.conclusion}));
}
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Report refused or failed. Verify explicit test scope, consent cutoff, schema and a new output directory. No automatic matching enabled.');process.exitCode=1;});
