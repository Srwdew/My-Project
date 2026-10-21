const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5173';
(async()=>{
 const screenshotDir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-screenshots-'));console.log('Screenshots:',screenshotDir);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{let port;for(let i=0;i<100;i++){try{const value=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(value)){port=value;break;}}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}await delay(100);}if(!port)throw Error('Chrome debugging port file not ready');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};

 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});


 function publicFixture(){
  const member=window.name==='guide-member';
  localStorage.clear();sessionStorage.clear();
  if(member)localStorage.setItem('spendsense_token','synthetic-member');
  window.__storageReads=[];window.__storageWrites=[];window.__apiCalls=[];
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  Storage.prototype.getItem=function(key){window.__storageReads.push(key);return get.call(this,key);};
  Storage.prototype.setItem=function(key,value){window.__storageWrites.push(key);return set.call(this,key,value);};
  const native=window.fetch.bind(window);
  window.fetch=(url,options)=>{const u=new URL(url,location.href);window.__apiCalls.push(u.pathname);if(u.origin!==location.origin||/^\/(api|auth|profile|settings|transactions|goals|budget|behavior|forecast|anomaly)/.test(u.pathname))throw Error('API forbidden in public guide test');return native(url,options);};
 }
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+publicFixture.toString()+')()'});
 const guideReady=()=>waitFor("document.querySelector('.guide-page h1')!==null");
 const assertPublic=async()=>{
  assert.equal(await evaluate("location.pathname"),'/guide');
  assert.equal(await evaluate("document.querySelectorAll('h1').length"),1);
  assert.equal(await evaluate("document.querySelectorAll('.guide-sections article').length"),7);
  assert.deepEqual(await evaluate("window.__apiCalls"),[]);
  assert.deepEqual(await evaluate("window.__storageReads"),[]);
  assert.deepEqual(await evaluate("window.__storageWrites"),[]);
  assert.equal(await evaluate("document.querySelector('.guide-footer').textContent.includes('ไม่ถือเป็นการให้ความยินยอม')"),true);
  assert.equal(await evaluate("[...document.querySelectorAll('.guide-topics a')].every(a=>document.querySelector(a.getAttribute('href'))?.getAttribute('aria-labelledby'))"),true);
 };
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/guide'});await guideReady();await assertPublic();
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 assert.equal(await evaluate("document.activeElement.className"),'guide-skip');
 assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle"),'solid');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await waitFor("document.activeElement.id==='guide-content'");
 assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
 await evaluate("scrollTo(0,0)");
 const desktop=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,'guide-desktop.png'),Buffer.from(desktop.data,'base64'));
 for(const width of [320,390,768]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,'guide-'+width+'.png'),Buffer.from(shot.data,'base64'));
 }
 const mobile=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,'guide-mobile.png'),Buffer.from(mobile.data,'base64'));

 for(const width of [320,390,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
  for(const target of ['guide-ocr','guide-limits']){
   await evaluate("document.querySelector('a[href=\"#"+target+"\"]').focus()");
   assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle"),'solid');
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   await waitFor("location.hash==='#"+target+"'");
   assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
   const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,target+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
  }
 }
 assert.equal(await evaluate("document.querySelectorAll('.guide-note').length"),7);
 assert.equal(await evaluate("document.querySelectorAll('.guide-start li').length"),3);
 assert.equal(await evaluate("[...document.querySelectorAll('.guide-actions a')].map(a=>a.getAttribute('href')).join(',')"),'/register,#guide-start');
 console.log('PASS visitor Guide: no API/storage reads or writes, static sections, consent text, keyboard skip/focus, 320/390/768/1440 responsive');

 await evaluate("window.name='guide-member'");
 await send('Page.navigate',{url:origin+'/guide'});await guideReady();await assertPublic();
 console.log('PASS member Guide: identical public content, no account/token reads and no API');
 await evaluate("window.name=''");
 for(const path of ['/register']){
  await send('Page.navigate',{url:origin+path});
  await waitFor("document.querySelector('a[href]')!==null");
  await evaluate("document.querySelector('a[href]').focus()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await guideReady();assert.equal(await evaluate("location.pathname"),'/guide');
 }
 console.log('PASS Register guide link works by keyboard; Login guide link intentionally removed');
 await send('Page.navigate',{url:origin+'/login'});await waitFor("document.querySelector('.login-card')!==null");
 assert.equal(await evaluate("!!document.querySelector('a[href=\"/guide\"]')"),false);
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('ลืมรหัสผ่าน')).click()");
 await waitFor("location.pathname==='/password-recovery'&&!!document.querySelector('#reset-email')");
 console.log('PASS Login has no guide button and Forgot Password opens existing recovery form');
 for(const path of ['/overview','/transactions/add','/settings','/admin']){
  await send('Page.navigate',{url:origin+path});
  await waitFor("location.pathname==='/login'&&document.querySelector('.login-card')!==null");
  assert.deepEqual(await evaluate("window.__apiCalls"),[]);
 }
 console.log('PASS protected routes still redirect guests before any financial API call');
 }finally{if(socket)socket.close();browser.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
