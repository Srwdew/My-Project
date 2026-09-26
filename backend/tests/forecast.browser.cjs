const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5174';
const {buildForecast,shiftDay}=require('../dist/lib/expenseForecast');
const {bangkokToday}=require('../dist/lib/goalCalculations');
const today=bangkokToday(),rows=Array.from({length:42},(_,i)=>({categoryId:'a',date:shiftDay(today,i-42),amount:'100.00',count:1}));
const input={asOfDate:today,rows,categories:[{id:'a',name:'หมวดยาว '.repeat(40)},{id:'b',name:'ข้อมูลไม่พอ'}],budgetAmount:null};
const payloads={available:buildForecast(input),empty:buildForecast({...input,rows:[]}),partial:buildForecast({...input,budgetAmount:'9999999999999999.99',rows:[...rows,{categoryId:'b',date:today,amount:'0.07',count:1}]})};
const mock=(payloads)=>{
 localStorage.setItem('spendsense_token','session-a');window.__mode='partial';window.__payloads=payloads;window.__requests=[];window.__gates=[];window.__release=()=>window.__gates.splice(0).forEach(r=>r());
 const native=window.fetch.bind(window);
 window.fetch=async(url,options={})=>{
  if(!String(url).startsWith('http://localhost:4000'))return native(url,options);
  const route=new URL(url).pathname,session=new Headers(options.headers).get('Authorization')?.replace('Bearer ','');
  let data={};
  if(route==='/profile')data={userId:session,email:session+'@example.invalid',displayName:session,hasAvatar:false};
  if(route==='/notifications')data={items:[],unreadCount:0};
  if(route==='/transactions'||route==='/categories')data=[];
  if(route==='/forecast'){
   const record={session,held:false,aborted:false,consumed:false};window.__requests.push(record);
   options.signal?.addEventListener('abort',()=>{record.aborted=true;},{once:true});
   if(window.__hold){record.held=true;await new Promise(r=>window.__gates.push(r));}
   if(window.__fail){window.__fail=false;return new Response('{}',{status:503});}
   data=structuredClone(payloads[window.__mode]);data.categories.forEach(c=>c.categoryName=session+' '+c.categoryName);
   const response=new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
   const json=response.json.bind(response);response.json=async()=>{const value=await json();record.consumed=true;return value;};return response;
  }
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 };
};
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-settings-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{for(let i=0;i<100&&!fs.existsSync(path.join(dir,'DevToolsActivePort'));i++)await delay(100);const port=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};

 await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+mock.toString()+')('+JSON.stringify(payloads)+')'});
 await send('Page.navigate',{url:origin+'/forecast'});
 await waitFor("document.querySelectorAll('.forecast-table tbody tr').length>=3");
 assert.ok(await evaluate("document.querySelector('.forecast-page').textContent.includes('รวมเฉพาะหมวดที่พร้อม')"));
 assert.ok(await evaluate("document.querySelector('.forecast-page').textContent.includes('ยังสรุปแนวโน้มรวมไม่ได้')"));
 assert.ok(await evaluate("document.querySelector('.forecast-warning').textContent.includes('ไม่ได้ยืนยัน')"));
 assert.equal(await evaluate("document.querySelectorAll('.forecast-panel svg').length"),1);
 console.log('PASS partial category coverage, exact dates, missing-day warning, no within-budget claim');
 await evaluate("document.querySelector('details summary').focus()");await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await waitFor("document.querySelector('details').open");assert.equal(await evaluate("document.querySelector('details tbody').rows.length"),14);
 await evaluate("document.querySelector('.forecast-panel select').value='a';document.querySelector('.forecast-panel select').dispatchEvent(new Event('change',{bubbles:true}))");
 assert.equal(await evaluate("document.querySelector('.forecast-panel select').value"),'a');
 console.log('PASS keyboard accessible actual/forecast table and category selector');
 await evaluate("window.__mode='empty';window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelector('.forecast-page').textContent.includes('ยังไม่มีรายการรายจ่ายในช่วงอ้างอิง')");
 assert.equal(await evaluate("document.querySelectorAll('.forecast-panel svg').length"),0);
 assert.ok(await evaluate("document.querySelector('.forecast-cards strong').textContent.includes('ยังพยากรณ์ไม่ได้')"));
 console.log('PASS unavailable is null/no forecast graph, not a zero forecast');
 await evaluate("window.__mode='available';window.__fail=true;window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("Boolean(document.querySelector('.forecast-page [role=alert] button'))");await evaluate("document.querySelector('.forecast-page [role=alert] button').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await waitFor("document.querySelector('.forecast-page').textContent.includes('ยังไม่ได้ตั้งงบรวม')");
 console.log('PASS error keyboard retry and available without budget');
 await evaluate("window.__hold=true;window.dispatchEvent(new Event('spendsense-data-changed'))");await waitFor("window.__requests.at(-1).held");
 await evaluate("window.__hold=false;localStorage.setItem('spendsense_token','session-b');window.dispatchEvent(new Event('spendsense-session'))");
 await waitFor("document.querySelector('.forecast-page').textContent.includes('session-b')");
 await evaluate("window.__release()");await waitFor("window.__requests.every(r=>!r.held||r.consumed)");
 await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 assert.equal(await evaluate("document.querySelector('.forecast-page').textContent.includes('session-a')"),false);
 assert.ok(await evaluate("window.__requests.filter(r=>r.held).every(r=>r.aborted)"));
 console.log('PASS deferred response despite abort cannot overwrite new session');
 await evaluate("window.__hold=true;window.dispatchEvent(new Event('spendsense-data-changed'))");await waitFor("window.__requests.at(-1).held");
 console.log('NAV_DIAGNOSTIC',await evaluate("({path:location.pathname,links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href'))})")); await evaluate("document.querySelector('a[href=\"/transactions\"]').click()");
 await waitFor("location.pathname==='/transactions'");
 await evaluate("window.__hold=false;window.__release()");await waitFor("window.__requests.every(r=>!r.held||r.consumed)");
 assert.equal(await evaluate("Boolean(document.querySelector('.forecast-page'))"),false);
 await evaluate("document.querySelector('a[href=\"/forecast\"]').click()");await waitFor("Boolean(document.querySelector('.forecast-panel svg'))");
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 console.log('MOBILE_DIAGNOSTIC',await evaluate('[...document.querySelectorAll(".forecast-page select,.forecast-panel,.forecast-table,.forecast-header")].map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right}))')); assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);
 assert.ok(await evaluate("[...document.querySelectorAll('.forecast-table')].every(el=>el.scrollWidth>=el.clientWidth)"));
 console.log('PASS navigation cancellation and mobile long category/money overflow containment');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();console.log('Forecast browser: API mocks only, no application database.');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
