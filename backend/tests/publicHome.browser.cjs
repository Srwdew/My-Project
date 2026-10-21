const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5173';
(async()=>{
 const screenshotDir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-screenshots-'));console.log('Screenshots:',screenshotDir);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{let port;for(let i=0;i<100;i++){try{const value=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(value)){port=value;break;}}catch(e){if(!['ENOENT','EBUSY','EPERM'].includes(e.code))throw e;}await delay(100);}if(!port)throw Error('Chrome debugging port file not ready');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};

 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});



 function fixture(){
  localStorage.clear();sessionStorage.clear();
  const mode=window.name||'guest';if(mode!=='guest')localStorage.setItem('spendsense_token','synthetic-'+mode);
  window.__apiCalls=[];const native=window.fetch.bind(window);
  window.fetch=async(url,options)=>{
    const u=new URL(url,location.href);
    if(u.origin===location.origin)return native(url,options);
    window.__apiCalls.push(u.pathname);
    if(u.pathname==='/auth/me')return new Response(JSON.stringify({role:mode==='admin'?'ADMIN':'USER',showSetup:mode==='setup'}),{status:200,headers:{'Content-Type':'application/json'}});
    return new Promise(()=>{}); // No financial API or real account is accessed.
  };
 }
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture.toString()+')()'});
 await send('Page.navigate',{url:origin+'/'});await waitFor("!!document.querySelector('.guide-page')");
 assert.deepEqual(await evaluate("window.__apiCalls"),[]);
 assert.ok(await evaluate("Array.from(document.querySelectorAll('a')).some(a=>a.pathname==='/login')"));
 assert.ok(await evaluate("Array.from(document.querySelectorAll('a')).some(a=>a.pathname==='/register')"));
 await send('Page.reload');await waitFor("!!document.querySelector('.guide-page')");
 for(const width of [320,390,1440]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
   assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
 }
 console.log('PASS guest root/refresh, Login/Register entry and responsive layout');
 for(const path of ['/password-recovery','/forgot-password']){
  await send('Page.navigate',{url:origin+path});await waitFor("!!document.querySelector('#reset-email')");
  await send('Page.reload');await waitFor("!!document.querySelector('#reset-email')");
 }
 await send('Page.navigate',{url:origin+'/reset-password'});await waitFor("!!document.querySelector('[role=alert]')");
 console.log('PASS direct recovery alias, legacy forgot and reset routes');
 for(const [mode,path] of [['admin','/admin'],['setup','/setup'],['member','/overview']]){
  await evaluate("window.name="+JSON.stringify(mode));
  await send('Page.navigate',{url:origin+'/'});await waitFor("location.pathname==="+JSON.stringify(path));
  assert.ok(await evaluate("window.__apiCalls.includes('/auth/me')"));
 }
 console.log('PASS authenticated root checks backend role/setup and preserves destinations');
 if(process.env.VERIFY_LOCAL_BACKEND==='true'){
  const tree=await send('Page.getFrameTree');
  const world=await send('Page.createIsolatedWorld',{frameId:tree.frameTree.frame.id,worldName:'local-connectivity'});
  const result=await send('Runtime.evaluate',{contextId:world.executionContextId,awaitPromise:true,returnByValue:true,
    expression:"(async()=>{const r=await fetch('http://localhost:4000/health/db');const body=await r.json();const auth=await fetch('http://localhost:4000/auth/me');return {status:r.status,connected:body.database==='connected',authStatus:auth.status}})()"});
  assert.deepEqual(result.result.value,{status:200,connected:true,authStatus:401});
  console.log('PASS real frontend-origin browser can reach backend and existing database; anonymous auth denied');
 }

 }finally{if(socket)socket.close();browser.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
