// Local operator CLI only. Never imported by the web server; no dotenv or default target.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { provisionAdmin, provisionInput, AdminProvisionError } from '../lib/adminProvision';
async function main(){
 const args=process.argv.slice(2),options:Record<string,string>={};
 for(let i=0;i<args.length;i++){
  const key=args[i]!;
  if(key==='--execute'){if(options.execute)throw new AdminProvisionError('Duplicate option');options.execute='true';continue;}
  if(!['--mode','--target-id','--target-email','--previous-id','--previous-email','--database-name','--database-host','--confirm'].includes(key)||options[key]!==undefined||!args[i+1]||args[i+1]!.startsWith('--'))throw new AdminProvisionError('Invalid or duplicate CLI option');
  options[key]=args[++i]!;
 }
 if(!process.env.DATABASE_URL)throw new AdminProvisionError('Explicit DATABASE_URL required; .env is not loaded');
 const url=new URL(process.env.DATABASE_URL);
 if(!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.pathname.slice(1))!==options['--database-name']||url.host!==options['--database-host'])throw new AdminProvisionError('Explicit database name and host:port must match DATABASE_URL');
 const input=provisionInput.parse({mode:options['--mode'],targetId:options['--target-id'],targetEmail:options['--target-email'],
   ...(options['--previous-id']?{previousId:options['--previous-id']} : {}),...(options['--previous-email']?{previousEmail:options['--previous-email']}: {})});
 const confirmation=[input.mode,input.previousId??'none',input.targetId].join(':');
 if(options.execute&&options['--confirm']!==confirmation)throw new AdminProvisionError('Use preview first and confirm exact mode:previous-id-or-none:target-id');
 console.log(JSON.stringify({database:options['--database-name'],host:options['--database-host'],execute:!!options.execute}));
 const client=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
 try{console.log(JSON.stringify(await provisionAdmin(client,input,!!options.execute)));if(!options.execute)console.log('Required --confirm:',confirmation);}
 finally{await client.$disconnect();}
}
main().catch(e=>{console.error(e instanceof AdminProvisionError?e.message:'Admin command failed; check options and database availability. Credential details are not logged');process.exitCode=1;});
