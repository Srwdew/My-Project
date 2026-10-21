import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { RESET_POLICY, type ResetPolicy } from './passwordReset';
export class ResetConfigError extends Error {
  constructor(public fields:string[]) { super('PASSWORD_RESET_CONFIG_INVALID: '+fields.join(',')); }
}
const loopback=(host:string)=>['localhost','127.0.0.1','[::1]'].includes(host);
export function validateResetOrigin(value:string,allowlist:string[],production:boolean) {
  try {
    const u=new URL(value);
    if(u.origin!==value || u.username || u.password || u.pathname!=='/' || u.search || u.hash ||
      !allowlist.includes(value) || (production ? u.protocol!=='https:' : u.protocol!=='https:' && !(u.protocol==='http:'&&loopback(u.hostname))))
      throw Error();
    return value;
  }catch {throw new ResetConfigError(['PUBLIC_APP_ORIGIN','PASSWORD_RESET_ALLOWED_ORIGINS']);}
}
export function productionPolicy(env:NodeJS.ProcessEnv):ResetPolicy {
  const fields:string[]=[];
  const value=(key:string)=>{const raw=env[key]??'';const n=Number(raw);if(!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(n)||n>2147483646)fields.push(key);return n;};
  const rule=(key:string)=>({limit:value('PASSWORD_RESET_'+key+'_LIMIT'),windowMs:value('PASSWORD_RESET_'+key+'_WINDOW_MS')});
  const p={version:'configured-v1',ttlMs:RESET_POLICY.ttlMs,requestIp:rule('REQUEST_IP'),emailMinute:rule('EMAIL_SHORT'),
    emailHour:rule('EMAIL_LONG'),resetIp:rule('RESET_IP'),resetToken:rule('RESET_TOKEN')};
  if(fields.length)throw new ResetConfigError(fields);
  return p;
}
export function trustedResetProxies(raw:string|undefined,required=false) {
  if(raw==='none'||(!required&&!raw))return [];
  const ips=(raw??'').split(',').map(v=>v.trim());
  if(!ips.length||ips.some(ip=>!isIP(ip)))throw new ResetConfigError(['PASSWORD_RESET_TRUSTED_PROXIES']);
  return ips;
}
// Only explicitly trusted peers may supply forwarding information. Walk from the right.
export function resetClientIp(req:Pick<IncomingMessage,'socket'|'headers'>,trusted:readonly string[]) {
  const peer=req.socket.remoteAddress??'unknown';
  if(!trusted.includes(peer))return peer;
  const raw=req.headers['x-forwarded-for'];
  if(typeof raw!=='string'||raw.length>2048)return peer;
  const chain=raw.split(',').map(v=>v.trim());
  if(chain.some(ip=>!isIP(ip)))return peer;
  let ip=peer;
  for(let i=chain.length-1;i>=0&&trusted.includes(ip);i--)ip=chain[i]!;
  return ip;
}
