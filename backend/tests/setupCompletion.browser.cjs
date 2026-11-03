require('./browserGuard.cjs');
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5177';
(async()=>{
 const screenshotDir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-screenshots-'));console.log('Screenshots:',screenshotDir);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{let port;for(let i=0;i<100;i++){try{const value=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(value)){port=value;break;}}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}await delay(100);}if(!port)throw Error('Chrome debugging port file not ready');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};




 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 function fixture(){
  if(!sessionStorage.getItem('setup-fixture')){
   sessionStorage.setItem('setup-fixture',JSON.stringify({incomplete:null,complete:'2026-10-01T00:00:00.000Z'}));
   localStorage.setItem('spendsense_token','incomplete');
  }
  window.__calls=[];
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  window.fetch=async(url,options={})=>{
   const u=new URL(url,location.href);if(u.origin!=='http://localhost:4000')throw Error('Unexpected origin');
   const who=new Headers(options.headers).get('Authorization')?.replace('Bearer ','')||'incomplete';
   const db=JSON.parse(sessionStorage.getItem('setup-fixture'));
   const path=u.pathname;window.__calls.push({path,method:options.method||'GET',who});
   if(path==='/auth/login'){const b=JSON.parse(options.body);const token=b.email.startsWith('complete')?'complete':'incomplete';const key='prompt-'+token;const showSetup=!db[token];sessionStorage.setItem(key,'1');return json({token,showSetup});}
   if(path==='/auth/me'){
    if(window.__failAuth)return json({},503);
    const result={id:who,role:who==='admin'?'ADMIN':'USER',showSetup:who!=='admin'&&!db[who],setupCompletedAt:db[who]};
    if(window.__holdAuth){window.__holdAuth=false;window.__authHeld=true;await new Promise(r=>window.__releaseAuth=r);}
    return json(result);
   }
   if(path==='/profile')return json({userId:who,email:who+'@example.invalid',displayName:who,hasAvatar:false});
   if(path==='/notifications')return json({items:[],unreadCount:0});
   if(path==='/settings'){
    if(options.method==='PUT'){
     if(window.__failSave)return json({error:'Save rejected'},500);
     const b=JSON.parse(options.body);if(b.completeSetup!==true)return json({},400);
     db[who]=db[who]||'2026-10-01T01:00:00.000Z';sessionStorage.setItem('setup-fixture',JSON.stringify(db));
    }
    return json({email:who+'@example.invalid',goals:[],primaryGoal:null,hasAvatar:false,userId:who,setupCompletedAt:db[who],displayName:who,income:'25000.00',budgetAmount:'9000.00',paydayDay:null,primaryGoalId:null,legacyGoal:null,budgetMonth:'2026-10',notifications:{notifyNearLimit:false,notifyExceeded:false}});
   }
   return json({},503);
  };
 }
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture.toString()+')()'});
 const go=p=>send('Page.navigate',{url:origin+p}),ready=()=>waitFor("document.querySelector('#setup-income')!==null");
 const switchTo=who=>evaluate("localStorage.setItem('spendsense_token',"+JSON.stringify(who)+");window.dispatchEvent(new Event('spendsense-session'))");
 const fill=async(selector,value)=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});


 for(const route of ['/overview','/budget','/transactions','/settings']){
  await go(route);await ready();assert.equal(await evaluate('location.pathname'),'/setup');
  assert.equal(await evaluate("!!document.querySelector('.app-layout')"),false);
  assert.equal(await evaluate("!!document.querySelector('.setup-actions a')"),false);
 }
 await send('Page.reload');await ready();
 console.log('PASS incomplete direct URLs/refresh require standalone setup with no skip');
 const login=async(email)=>{await go('/login');await waitFor("!!document.querySelector('#email')");await fill('#email',email);await fill('#password','fixture-only');await evaluate("document.querySelector('.login-submit').click()");};
 await login('incomplete@example.invalid');await ready();
 await login('incomplete@example.invalid');await ready();
 console.log('PASS every login requires completion, including previously prompted member');
 await evaluate("window.__failSave=true;document.querySelector('.setup-submit').click()");await waitFor("!!document.querySelector('.setup-error')");
 assert.equal(await evaluate('location.pathname'),'/setup');
 await evaluate("window.__failSave=false;document.querySelector('.setup-submit').click()");await waitFor("location.pathname==='/overview'");
 await go('/setup');await waitFor("location.pathname==='/overview'");
 await login('complete@example.invalid');await waitFor("location.pathname==='/overview'");
 await switchTo('admin');await go('/setup');await waitFor("location.pathname==='/admin'");
 console.log('PASS rejected save stays, confirmed completion leaves, completed/admin bypass onboarding');
 await evaluate("sessionStorage.setItem('setup-fixture',JSON.stringify({incomplete:null,complete:'2026-10-01'}))");
 await switchTo('incomplete');await go('/setup');await ready();
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
 await evaluate("document.querySelector('.setup-actions button[type=button]').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await waitFor("location.pathname==='/login'");
 await go('/setup');await waitFor("location.pathname==='/login'");
 console.log('PASS mobile, keyboard logout and guest guard');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
