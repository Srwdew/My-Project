import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredMailer } from '../src/lib/passwordResetProviders';
import { validateResetOrigin, productionPolicy, resetClientIp, trustedResetProxies } from '../src/lib/passwordResetConfig';
const env={NODE_ENV:'production',PASSWORD_RESET_MAIL_PROVIDER:'gmail',PASSWORD_RESET_FROM:'sender@example.test',
 GMAIL_CLIENT_ID:'synthetic-client',GMAIL_CLIENT_SECRET:'synthetic-client-secret',GMAIL_REFRESH_TOKEN:'synthetic-refresh'};
const message={to:'recipient@example.test',resetUrl:'https://app.example.test/reset-password#token=synthetic',expiresInMinutes:15 as const};
test('exact HTTPS origin allowlist rejects paths/credentials/HTTP/unlisted origins',()=>{
 const origin='https://app.example.test';
 assert.equal(validateResetOrigin(origin,[origin],true),origin);
 for(const bad of ['http://app.example.test',origin+'/',origin+'/evil',origin+'?x=1','https://evil.test','https://user@ app.example.test'])
   assert.throws(()=>validateResetOrigin(bad,[origin],true));
});
test('production has no default numeric policy; requires all configured scopes',()=>{
 assert.throws(()=>productionPolicy({}));
 const e:NodeJS.ProcessEnv={};
 for(const s of ['REQUEST_IP','EMAIL_SHORT','EMAIL_LONG','RESET_IP','RESET_TOKEN']){e['PASSWORD_RESET_'+s+'_LIMIT']='2';e['PASSWORD_RESET_'+s+'_WINDOW_MS']='1000';}
 assert.equal(productionPolicy(e).resetIp.limit,2);
 e.PASSWORD_RESET_RESET_IP_LIMIT='0';assert.throws(()=>productionPolicy(e));
});
test('proxy policy trusts only configured peer and rightmost untrusted hop',()=>{
 const req=(peer:string,header:string)=>({socket:{remoteAddress:peer},headers:{'x-forwarded-for':header}} as any);
 assert.equal(resetClientIp(req('192.0.2.2','198.51.100.1'),[]),'192.0.2.2');
 assert.equal(resetClientIp(req('127.0.0.1','192.0.2.9, 198.51.100.1'),['127.0.0.1']),'198.51.100.1');
 assert.equal(resetClientIp(req('127.0.0.1','not-an-ip'),['127.0.0.1']),'127.0.0.1');
 assert.throws(()=>trustedResetProxies(undefined,true));assert.throws(()=>trustedResetProxies('*',true));
 assert.deepEqual(trustedResetProxies('none',true),[]);
});
test('local defaults, production local and unknown/multiple providers fail closed',()=>{
 for(const e of [{NODE_ENV:'production'}, {...env,PASSWORD_RESET_MAIL_PROVIDER:'gmail,smtp'}, {...env,NODE_ENV:'test'}, {...env,PASSWORD_RESET_FROM:'evil\r\nBcc: x@example.test'}])
 assert.throws(()=>configuredMailer(e));
});
test('Gmail uses refresh exchange and exactly one send, redacts provider failure, never retries',async()=>{
 for(const outcome of ['ok','failed','timeout']){
  const calls:string[]=[];
  const request=async(url:any,options:any)=>{
   calls.push(String(url));assert.equal(options.redirect,'error');assert.ok(options.signal);
   if(calls.length===1)return new Response(JSON.stringify({access_token:'synthetic-access'}),{status:200});
   if(outcome==='timeout')throw Error(message.resetUrl+' private-provider-error');
   return new Response('{}',{status:outcome==='ok'?200:503});
  };
  const mailer=configuredMailer(env,{fetch:request as typeof fetch});
  if(outcome==='ok')await mailer.send(message);else await assert.rejects(mailer.send(message),{message:'PASSWORD_RESET_MAIL_FAILED'});
  assert.deepEqual(calls,['https://oauth2.googleapis.com/token','https://gmail.googleapis.com/gmail/v1/users/me/messages/send']);
 }
});
test('Gmail auth failure does not send and never exposes provider response',async()=>{
 let calls=0;const mailer=configuredMailer(env,{fetch:(async()=>{calls++;return new Response('private',{status:401});}) as typeof fetch});
 await assert.rejects(mailer.send(message),{message:'PASSWORD_RESET_MAIL_FAILED'});assert.equal(calls,1);
});
test('SMTP TLS, validation, one send, no retries/fallback; errors redacted',async()=>{
 for(const port of ['465','587'])for(const failed of [false,true]){
 let calls=0;
 const e={...env,PASSWORD_RESET_MAIL_PROVIDER:'smtp',SMTP_HOST:'smtp.example.test',SMTP_PORT:port,SMTP_USER:'synthetic',SMTP_PASSWORD:'synthetic'};
 const transport=((options:any)=>{
 assert.equal(options.requireTLS,true);assert.equal(options.secure,port==='465');assert.equal(options.tls.rejectUnauthorized,true);
 assert.equal(options.logger,false);assert.equal(options.disableFileAccess,true);assert.equal(options.disableUrlAccess,true);
 return {sendMail:async(data:any)=>{calls++;assert.equal(data.from,e.PASSWORD_RESET_FROM);if(failed)throw Error(message.resetUrl);return {accepted:[message.to],rejected:[]};}};
 }) as any;
 const mailer=configuredMailer(e,{transport});
 if(failed)await assert.rejects(mailer.send(message),{message:'PASSWORD_RESET_MAIL_FAILED'});else await mailer.send(message);
 assert.equal(calls,1);
 }
 assert.throws(()=>configuredMailer({...env,PASSWORD_RESET_MAIL_PROVIDER:'smtp',SMTP_HOST:'smtp.example.test',SMTP_PORT:'25',SMTP_USER:'synthetic',SMTP_PASSWORD:'synthetic'}));
});
test('development sends externally only with explicit PASSWORD_RESET_MODE=dev-mail',()=>{
 assert.throws(()=>configuredMailer({...env,NODE_ENV:'development'}));
 assert.throws(()=>configuredMailer({...env,NODE_ENV:'development',PASSWORD_RESET_MODE:'local-test'}));
 assert.equal(typeof configuredMailer({...env,NODE_ENV:'development',PASSWORD_RESET_MODE:'dev-mail'}).send,'function');
});
