const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5177';
(async()=>{
 const screenshotDir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-screenshots-'));console.log('Screenshots:',screenshotDir);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{let port;for(let i=0;i<100;i++){try{const value=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(value)){port=value;break;}}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}await delay(100);}if(!port)throw Error('Chrome debugging port file not ready');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};



 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
 localStorage.setItem('spendsense_token','setup-a');window.__calls=[];
 const make=(id,name)=>({userId:id,setupCompletedAt:null,displayName:name,income:null,paydayDay:null,budgetMonth:'2026-10',budgetAmount:null,primaryGoalId:null,legacyGoal:null,notifications:{notifyNearLimit:false,notifyExceeded:false,notifyAnomaly:false}});
 window.__db={a:make('a',null),b:{...make('b','Existing name'),income:'25000.00',paydayDay:25,budgetAmount:'9000.00',primaryGoalId:'existing-goal',legacyGoal:'old custom intention'}};
 window.fetch=async(url,options={})=>{
 const u=new URL(url,location.href);if(u.origin!==location.origin&&u.origin!=='http://localhost:4000')throw Error('Unexpected API origin');
 const who=new Headers(options.headers).get('Authorization')?.includes('setup-b')?'b':'a',method=options.method||'GET';
 window.__calls.push({path:u.pathname,method,body:options.body?JSON.parse(options.body):null,who});
 if(u.pathname==='/auth/me')return new Response(JSON.stringify({id:who,role:'USER',showSetup:!window.__db[who].setupCompletedAt,setupCompletedAt:window.__db[who].setupCompletedAt}));
 if(u.pathname==='/profile')return new Response(JSON.stringify({email:'fixture@example.invalid',displayName:window.__db[who].displayName}));
 if(u.pathname!=='/settings')return new Response('{}',{status:503});
 if(method==='GET'){
  if(window.__failGet)return new Response('{}',{status:503});
  const snapshot=structuredClone(window.__db[who]);
  if(window.__holdGet){window.__holdGet=false;window.__held=true;await new Promise(r=>window.__release=r);}
  return new Response(JSON.stringify(snapshot));
 }
 if(window.__saveFailure)return new Response(JSON.stringify({error:'บันทึกทดสอบไม่สำเร็จ'}),{status:window.__saveFailure});
 const body=JSON.parse(options.body);const old=window.__db[who];window.__db[who]={...old,...body,setupCompletedAt:body.completeSetup?(old.setupCompletedAt||'2026-10-01T00:00:00.000Z'):old.setupCompletedAt,legacyGoal:body.financialIntention??old.legacyGoal,notifications:{...old.notifications,notifyNearLimit:body.notifyNearLimit,notifyExceeded:body.notifyExceeded}};
 if(window.__holdSave){window.__saveHeld=true;await new Promise(r=>window.__releaseSave=r);}
 return new Response(JSON.stringify(window.__db[who]));
 };})();`});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/setup'});
 const ready=()=>waitFor("document.querySelector('#setup-income')!==null");
 const fill=async(selector,value)=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 const submit=()=>evaluate("document.querySelector('.setup-submit').click()");
 const switchTo=async s=>evaluate("localStorage.setItem('spendsense_token','setup-"+s+"');window.dispatchEvent(new Event('spendsense-session'))");
 await ready();
 assert.equal(await evaluate("document.querySelector('#setup-payday').selectedOptions[0].textContent"),'ไม่แน่นอน');
 assert.equal(await evaluate("document.querySelector('#setup-name').value"),'');
 await submit();await waitFor("document.querySelector('[role=alert]')!==null");
 assert.equal(await evaluate("window.__calls.filter(c=>c.method==='PUT').length"),0);
 await fill('#setup-name','New name');await fill('#setup-income','-1');await submit();
 assert.equal(await evaluate("window.__calls.filter(c=>c.method==='PUT').length"),0);
 await fill('#setup-income','0.07');await fill('#setup-budget','100.01');await evaluate("document.querySelector('input[name=financial-intention]').click();window.__saveFailure=500");
 await submit();await waitFor("document.querySelector('[role=alert]')?.textContent.includes('บันทึกทดสอบไม่สำเร็จ')");
 assert.equal(await evaluate('location.pathname'),'/setup');assert.equal(await evaluate("document.querySelector('#setup-budget').value"),'100.01');
 await evaluate("window.__saveFailure=0;window.__holdSave=true");await submit();await waitFor('window.__saveHeld===true');
 assert.equal(await evaluate("document.querySelector('.setup-submit').disabled"),true);assert.equal(await evaluate("document.querySelector('.setup-page [role=status]')!==null"),true);
 await evaluate("document.querySelector('.setup-card form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
 assert.equal(await evaluate("window.__calls.filter(c=>c.method==='PUT').length"),2);
 await evaluate("window.__holdSave=false;window.__releaseSave()");await waitFor("location.pathname==='/overview'");
 assert.equal(await evaluate("window.__db.a.legacyGoal"),'เงินสำรองฉุกเฉิน');assert.equal(await evaluate("window.__db.a.primaryGoalId"),null);
 console.log('PASS first load/name/null payday, validation, failed save retained draft, busy/double submit, successful navigation');
 // Completed accounts cannot reopen onboarding. Then model a separate incomplete profile with prefilled values.
 await evaluate("window.__db.a.setupCompletedAt=null;history.pushState({},'','/setup');window.dispatchEvent(new PopStateEvent('popstate'))");await ready();
 assert.equal(await evaluate("document.querySelector('#setup-name')===null"),true);assert.equal(await evaluate("document.querySelector('#setup-income').value"),'0.07');
 await switchTo('b');await ready();assert.equal(await evaluate("document.querySelector('#setup-name')===null"),true);
 assert.equal(await evaluate("document.querySelector('#setup-budget').value"),'9000.00');assert.equal(await evaluate("document.querySelector('#setup-payday').value"),'25');
 assert.ok(await evaluate("document.querySelector('.setup-intentions').textContent.includes('old custom intention')"));
 await fill('#setup-budget','');await evaluate("window.__db.b.budgetAmount='9500.00';window.__db.b.primaryGoalId='latest-goal';window.__db.b.displayName='Latest name';document.querySelectorAll('input[name=financial-intention]')[2].click();window.__saveFailure=409");
 await submit();await waitFor("document.querySelector('[role=alert]')!==null");assert.equal(await evaluate('location.pathname'),'/setup');
 const payload=await evaluate("window.__calls.filter(c=>c.method==='PUT').at(-1).body");
 assert.equal(payload.budgetAmount,'9500.00');assert.equal(payload.primaryGoalId,'latest-goal');assert.equal(payload.displayName,'Latest name');assert.equal(payload.financialIntention,'ลดหนี้');assert.equal('notifyAnomaly' in payload,false);
 console.log('PASS prefill, existing name hidden, preserve refreshed budget/name/primary Goal, 409 stays on form');
 // Hold a real-shaped GET across session change; loading and old response cannot replace new draft.
 await evaluate("window.__holdGet=true;document.querySelector('.setup-error button').click()");await waitFor('window.__held===true');
 assert.equal(await evaluate("document.querySelector('.setup-page [role=status]')!==null"),true);
 await evaluate('window.__db.a.setupCompletedAt=null');await switchTo('a');await ready();await evaluate("window.__release()");await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 assert.equal(await evaluate("document.querySelector('#setup-income').value"),'0.07');
 // Failed loading is not an empty form.
 await fill('#setup-income','-1');await submit();await evaluate("window.__failGet=true;document.querySelector('.setup-error button').click()");
 await waitFor("document.querySelector('.setup-message [role=alert]')!==null");assert.equal(await evaluate("document.querySelector('#setup-income')===null"),true);
 await evaluate("window.__failGet=false;document.querySelector('.setup-message button').click()");await ready();
 // Save response from account A cannot navigate account B.
 await evaluate("window.__saveFailure=0;window.__holdSave=true;window.__saveHeld=false");await submit();await waitFor('window.__saveHeld===true');
 await switchTo('b');await ready();await evaluate("window.__holdSave=false;window.__releaseSave()");await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 assert.equal(await evaluate('location.pathname'),'/setup');assert.equal(await evaluate("document.querySelector('#setup-income').value"),'25000.00');
 console.log('PASS load retry, stale load and stale save/session switch');
 await evaluate("document.querySelector('#setup-income').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 assert.equal(await evaluate("document.activeElement.id"),'setup-payday');
 await evaluate("document.querySelector('input[name=financial-intention]').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 assert.equal(await evaluate("document.querySelector('input[name=financial-intention]').checked"),true);
 for(const width of [1440,390]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===390});await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 fs.writeFileSync(path.join(screenshotDir,'setup-form-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 }
 assert.equal(await evaluate("window.__calls.some(c=>/goals|transactions|opening/.test(c.path)&&c.method!=='GET')"),false);
 console.log('PASS keyboard, 1440/390px, no Goal/transaction mutations');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
