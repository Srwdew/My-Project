import {lstat,realpath,readdir,unlink} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {CONSENT_CUTOFF,RETENTION_MS} from '../src/lib/experimentRetention';
export type Artifact={id:string;path:string;kind:'backup'|'export';createdAt:Date;state:'present'|'failed'|'deleted'};
export function expiry(createdAt:Date){if(!Number.isFinite(+createdAt))throw Error('Invalid creation time');return new Date(+createdAt+RETENTION_MS);}
export async function inventory(root:string){
 const base=await realpath(root);const files:{path:string;bytes:number;birthtime:string;mtime:string}[]=[];
 async function walk(dir:string){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);const s=await lstat(p);if(s.isSymbolicLink())continue;if(s.isDirectory())await walk(p);else if(s.isFile())files.push({path:p,bytes:s.size,birthtime:s.birthtime.toISOString(),mtime:s.mtime.toISOString()});}}
 await walk(base);return files; // Metadata only. Never opens dump/export contents.
}
async function safeFile(path:string,roots:readonly string[]){
 const target=resolve(path);
 for(const root of roots){const base=await realpath(root),rel=relative(base,target);if(!rel||rel.startsWith('..')||isAbsolute(rel))continue;
  let current=base;for(const part of rel.split(/[\\/]/)){current=join(current,part);let s;try{s=await lstat(current);}catch(e){if(current===target&&(e as NodeJS.ErrnoException).code==='ENOENT')return target;throw e;}if(s.isSymbolicLink())throw Error('Unsafe link');}
  const actual=await realpath(target);if(actual!==target)throw Error('Noncanonical target');if(!(await lstat(actual)).isFile())throw Error('Not a file');return actual;
 }
 throw Error('Outside managed roots');
}
export async function deleteArtifact(a:Artifact,roots:readonly string[],now:Date,withdrawn:boolean){
 if(a.state==='deleted')return {state:'deleted' as const};
 if(+a.createdAt<+CONSENT_CUTOFF)return {state:'protected' as const};
 if(a.kind==='backup'&&+now<+expiry(a.createdAt))return {state:'waiting' as const};
 if(a.kind==='export'&&!withdrawn&&+now<+expiry(a.createdAt))return {state:'waiting' as const};
 try{const path=await safeFile(a.path,roots);try{await unlink(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}return {state:'deleted' as const};}
 catch{ return {state:'failed' as const,errorCode:'DELETE_NOT_VERIFIED'}; }
}
