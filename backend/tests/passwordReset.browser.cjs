// Real Chrome, real HTTP backend/PostgreSQL and local in-memory mail sink.
// Only remaps the development API origin to the isolated test listener; no response doubles.
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
exports.verifyResetBrowser=async function({base,email,password,tokenFor,drain}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-reset-browser-'));
 const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;
 try {
  for(let i=0;i<100&&!fs.existsSync(path.join(dir,'DevToolsActivePort'));i++)await delay(100);
  const port=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let id=0;const pending=new Map(),requests=[];
  socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(Error('Browser command failed'));else p.resolve(msg.result);}
   else if(msg.method==='Network.requestWillBeSent')requests.push(msg.params.request);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
  const wait=async expr=>{for(let i=0;i<120;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Browser UI condition timed out; alert='+await evaluate("document.querySelector('[role=alert]')?.textContent||'none'"));};
  const set=async(selector,value)=>evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const count=route=>requests.filter(r=>r.method==='POST'&&new URL(r.url).pathname===route).length;
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"{const native=window.fetch.bind(window);window.fetch=(url,options)=>native(String(url).startsWith('http://localhost:4000')?"+JSON.stringify(base)+"+String(url).slice('http://localhost:4000'.length):url,options);}"});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5173';
  await send('Page.navigate',{url:origin+'/login'});await wait("!!document.querySelector('#email')");
  await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent.includes('ลืมรหัสผ่าน')).click()");
  await wait("!!document.querySelector('#reset-email')");
  assert.equal(count('/auth/forgot-password'),0);
  await set('#reset-email',email);
  await evaluate("document.querySelector('form').requestSubmit();document.querySelector('form').requestSubmit()");
  await wait("!!document.querySelector('[role=status]')");assert.equal(count('/auth/forgot-password'),1);
  await drain();const token=tokenFor(email);
  await send('Page.navigate',{url:origin+'/reset-password#token='+token});await wait("!!document.querySelector('#new-password')");
  await wait("location.hash===''");
  assert.equal(count('/auth/reset-password'),0);
  assert.equal(await evaluate("Object.values(localStorage).some(v=>v.includes("+JSON.stringify(token)+"))||Object.values(sessionStorage).some(v=>v.includes("+JSON.stringify(token)+"))"),false);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  await set('#new-password',password);await set('#confirm-password','mismatch');
  await evaluate("document.querySelector('form').requestSubmit()");
  await wait("!!document.querySelector('[role=alert]')");assert.equal(count('/auth/reset-password'),0);
  await set('#confirm-password',password);
  await evaluate("document.querySelector('button[type=submit]').focus()");
  assert.equal(await evaluate("document.activeElement.type"),'submit');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait("!!document.querySelector('[role=status]')");
  assert.equal(count('/auth/reset-password'),1);assert.equal(count('/auth/login'),0);
  for(const r of requests) {
    assert.ok(!r.url.includes(token),'Token must not appear in network URL');
    assert.ok(!JSON.stringify(r.headers).includes(token),'Token must not appear in headers');
    if(new URL(r.url).pathname.startsWith('/auth/')&&r.method==='POST')assert.ok(!r.headers.Authorization);
  }
  await send('Page.navigate',{url:origin+'/reset-password#token='+token});await wait("!!document.querySelector('#new-password')");
  await set('#new-password',password);await set('#confirm-password',password);await evaluate("document.querySelector('form').requestSubmit()");
  await wait("!!document.querySelector('[role=alert]')");
  assert.ok(await evaluate("document.querySelector('[role=alert]').textContent.includes('หมดอายุ')"));
  await send('Page.reload');await wait("!!document.querySelector('[role=alert]')");
  assert.equal(await evaluate("!!document.querySelector('#new-password')"),false);

  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Page.navigate',{url:origin+'/forgot-password'});await wait("!!document.querySelector('#reset-email')");
  await evaluate("{const native=window.fetch;window.__release=null;window.fetch=async (...args)=>{const response=await native(...args);await new Promise(r=>window.__release=r);return response;};}");
  await set('#reset-email','session-switch@example.test');await evaluate("document.querySelector('form').requestSubmit()");
  await wait("!!window.__release");
  await evaluate("localStorage.setItem('spendsense_token','synthetic-new-session');window.dispatchEvent(new Event('spendsense-session'));window.__release()");
  await wait("!document.querySelector('fieldset').disabled");
  assert.equal(await evaluate("!!document.querySelector('[role=status]')"),false);
  assert.equal(await evaluate("localStorage.getItem('spendsense_token')"),'synthetic-new-session');
  assert.equal(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"),true);
  return {desktop:true,mobile390:true,keyboard:true,realHttp:true,sessionSwitch:true,reducedMotion:true};
 } finally {if(socket){try{socket.send(JSON.stringify({id:999999,method:'Browser.close'}));}catch{}socket.close();}browser.kill();}
};
