require('./browserGuard.cjs');
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5177';
(async()=>{
 const screenshotDir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-screenshots-'));console.log('Screenshots:',screenshotDir);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{let port;for(let i=0;i<100;i++){try{const value=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(value)){port=value;break;}}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}await delay(100);}if(!port)throw Error('Chrome debugging port file not ready');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};

 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 function fixture(){
  const intentions={emergency:'เงินสำรองฉุกเฉิน',shopping:'ออมเงินซื้อของ',debt:'ลดหนี้',investment:'ลงทุน',none:null,legacy:'old free text'};
  const current=sessionStorage.getItem('goal-account')||'emergency';localStorage.setItem('spendsense_token',current);
  window.__calls=[];window.__rows={};window.__replays={};window.__settingsLoaded=false;
  const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
  window.fetch=async(url,options={})=>{
   const u=new URL(url,location.href);if(u.origin!=='http://localhost:4000')throw Error('Unexpected API origin');
   const who=new Headers(options.headers).get('Authorization')?.replace('Bearer ','')||current;
   const method=options.method||'GET';window.__calls.push({path:u.pathname,method,who,body:options.body?JSON.parse(options.body):null});
   if(u.pathname==='/settings'){
    const value={legacyGoal:intentions[who]};if(window.__failSettings)return json({},503);
    if(window.__holdSettings){window.__holdSettings=false;window.__held=true;await new Promise(r=>window.__release=r);}
    window.__settingsLoaded=true;return json(value);
   }
   if(u.pathname==='/profile')return json({userId:who,email:who+'@example.invalid',displayName:who,hasAvatar:false});
   if(u.pathname==='/notifications')return json({items:[],unreadCount:0});
   if(u.pathname==='/notifications/reconcile')return json({});
   if(u.pathname==='/goals'){
    const rows=window.__rows[who]||=[];
    if(method==='POST'){
     const key=new Headers(options.headers).get('Idempotency-Key');if(!key)throw Error('Missing idempotency');
     if(window.__replays[key])return json(window.__replays[key]);
     const b=JSON.parse(options.body);
     const row={...b,id:'goal-'+who,archivedAt:null,savedAmount:'0.00',remainingAmount:b.targetAmount,overfundedAmount:'0.00',progressPercent:'0',progressBarPercent:'0',monthsRemaining:null,requiredMonthlyAmount:null,calculatedStatus:'not_started',warnings:[]};
     rows.push(row);window.__replays[key]=row;return json(row,201);
    }
    return json({data:rows,nextCursor:null});
   }
   throw Error('Unexpected API path '+u.pathname);
  };
 }
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture.toString()+')()'});
 const go=()=>send('Page.navigate',{url:origin+'/goals'});
 const ready=()=>waitFor("window.__settingsLoaded&&document.querySelector('.goals-empty,.goal-card')!==null");
 const switchTo=who=>evaluate("sessionStorage.setItem('goal-account',"+JSON.stringify(who)+");localStorage.setItem('spendsense_token',"+JSON.stringify(who)+");window.__settingsLoaded=false;window.dispatchEvent(new Event('spendsense-session'))");
 const fill=(name,value)=>evaluate("(()=>{const e=document.querySelector('dialog input[name="+JSON.stringify(name)+"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await go();await ready();
 for(const [who,name] of [['emergency','เงินสำรองฉุกเฉิน'],['shopping','ออมเงินซื้อของ']]){
  if(await evaluate("localStorage.getItem('spendsense_token')")!==who)await switchTo(who);await ready();
  assert.equal(await evaluate("document.querySelectorAll('.goals-intention').length"),1);
  await evaluate("document.querySelector('.goals-intention button').focus()");
  assert.equal(await evaluate("document.activeElement.textContent"),'เริ่มสร้างเป้าหมาย');
  await evaluate("document.querySelector('.goals-intention button').click()");
  await waitFor("document.querySelector('dialog[open] input[name=name]')!==null");
  assert.equal(await evaluate("document.querySelector('dialog input[name=name]').value"),name);
  assert.equal(await evaluate("document.querySelector('dialog input[name=targetAmount]').value"),'');
  assert.equal(await evaluate("document.querySelector('dialog input[name=targetDate]').value"),'');
  assert.equal(await evaluate("window.__calls.filter(c=>c.path==='/goals'&&c.method==='POST'&&c.who==="+JSON.stringify(who)+").length"),0);
  await fill('name',name+' ของฉัน');await fill('targetAmount','1234.56');await fill('targetDate','2027-12-31');
  await evaluate("document.querySelector('dialog button[type=submit]').click();document.querySelector('dialog button[type=submit]').click()");
  await waitFor("document.querySelector('dialog[open]')===null&&document.querySelector('.goal-card')!==null");
  assert.equal(await evaluate("window.__calls.filter(c=>c.path==='/goals'&&c.method==='POST'&&c.who==="+JSON.stringify(who)+").length"),1);
  const rows=await evaluate('window.__rows['+JSON.stringify(who)+']');assert.equal(rows.length,1);assert.equal(rows[0].name,name+' ของฉัน');assert.equal(rows[0].targetAmount,'1234.56');assert.equal(rows[0].targetDate,'2027-12-31');
 }
 console.log('PASS two intentions: editable name only, no create until Save, one goal with entered values');
 for(const who of ['debt','investment','none','legacy']){
  await switchTo(who);await ready();assert.equal(await evaluate("document.querySelector('.goals-intention')"),null);
  await evaluate("document.querySelector('.goals-header button').click()");
  await waitFor("document.querySelector('dialog[open] input[name=name]')!==null");
  assert.equal(await evaluate("document.querySelector('dialog input[name=name]').value"),'');
  await evaluate("document.querySelector('dialog button[aria-label]').click()");
  assert.equal(await evaluate("window.__calls.some(c=>c.path==='/goals'&&c.method==='POST'&&c.who==="+JSON.stringify(who)+")"),false);
 }
 console.log('PASS debt/investment/empty/unknown: no suggestion, ordinary form unchanged');
 await switchTo('emergency');await ready();await go();await ready();
 assert.ok(await evaluate("document.querySelector('.goals-intention').textContent.includes('เงินสำรองฉุกเฉิน')"));
 await evaluate("window.__holdSettings=true");await switchTo('shopping');await waitFor('window.__held===true');
 await switchTo('debt');await ready();await evaluate("window.__release();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 assert.equal(await evaluate("document.querySelector('.goals-intention')"),null);
 await evaluate('window.__failSettings=true');await switchTo('emergency');await waitFor("document.querySelector('.goals-error button')!==null");
 assert.ok(await evaluate("document.querySelector('.goals-header button')!==null"));
 await evaluate("window.__failSettings=false;document.querySelector('.goals-error button').click()");
 await waitFor("document.querySelector('.goals-intention')!==null");
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 console.log('PASS direct URL/refresh, stale session response, failure/retry, mobile overflow');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
