const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5177';
const {buildBehavior}=require('../dist/lib/behavior'),{behaviorPeriod,shiftDay}=require('../dist/lib/behaviorRules'),{bangkokToday}=require('../dist/lib/goalCalculations');
const today=bangkokToday(),period=behaviorPeriod({},today),testCategoryId='11111111-1111-4111-8111-111111111111';
const history=(start,count=30)=>Array.from({length:count},(_,i)=>({categoryId:testCategoryId,categoryName:'ชื่อหมวดยาว '.repeat(30),date:shiftDay(start,i),bucket:3,count:1,amount:'100.00'}));
const options=[{categoryId:testCategoryId,categoryName:'ชื่อหมวดยาว '.repeat(30)},{categoryId:null,categoryName:'ไม่ระบุหมวด'}];
const base={asOfDate:today,period,rows:[...history(period.previous.startDate),...history(period.current.startDate)],categoryOptions:options,recurrences:[]};
const payloads={full:buildBehavior(base),limited:buildBehavior({...base,rows:history(period.current.startDate,5)}),empty:buildBehavior({...base,rows:[]})};
const mock=(payloads)=>{
 localStorage.setItem('spendsense_token','session-a');window.__mode='full';window.__requests=[];window.__gates=[];window.__release=()=>window.__gates.splice(0).forEach(r=>r());
 const native=window.fetch.bind(window);window.fetch=async(url,options={})=>{
  if(!String(url).startsWith('http://localhost:4000'))return native(url,options);
  const uri=new URL(url),route=uri.pathname,session=new Headers(options.headers).get('Authorization')?.replace('Bearer ','');
  let data={};
  if(route==='/profile')data={userId:session,email:session+'@example.invalid',displayName:session,hasAvatar:false};
  if(route==='/notifications')data={items:[],unreadCount:0};
  if(route==='/transactions'||route==='/categories')data=[];
  if(route==='/behavior'){
   const record={session,query:uri.search,held:false,aborted:false,consumed:false};window.__requests.push(record);
   options.signal?.addEventListener('abort',()=>{record.aborted=true;},{once:true});
   data=structuredClone(payloads[window.__mode]);data.facts.categories.forEach(c=>c.categoryName=session+' '+c.categoryName);data.categoryOptions.forEach(c=>c.categoryName=session+' '+c.categoryName);
   if(window.__hold){record.held=true;await new Promise(r=>window.__gates.push(r));}
   if(window.__fail){window.__fail=false;return new Response(JSON.stringify({error:'ทดสอบ error'}),{status:503});}
   const response=new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}),json=response.json.bind(response);
   response.json=async()=>{const value=await json();record.consumed=true;return value;};return response;
  }
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 };
};
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-settings-browser-'));const browser=cp.spawn(process.env.SETTINGS_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;try{for(let i=0;i<100&&!fs.existsSync(path.join(dir,'DevToolsActivePort'));i++)await delay(100);const port=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});let id=0;const pending=new Map();socket.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id){const pair=pending.get(msg.id);pending.delete(msg.id);if(msg.error)pair.reject(Error(msg.error.message));else pair.resolve(msg.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};const waitFor=async(expr)=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await delay(50);}throw Error('Timed out: '+expr);};


 await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+mock.toString()+')('+JSON.stringify(payloads)+')'});
 await send('Page.navigate',{url:origin+'/behavior'});
 await waitFor("document.querySelector('.behavior-change')!==null");
 assert.ok(await evaluate("document.querySelector('.behavior-page').textContent.includes('ไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง')"));
 assert.equal(await evaluate("document.querySelectorAll('.behavior-chart').length"),1);
 assert.equal(await evaluate("document.querySelectorAll('.behavior-controls').length"),1);
 assert.equal(await evaluate("document.querySelectorAll('.behavior-page form').length"),0);
 await evaluate("document.querySelector('select[name=period]').value='custom';document.querySelector('select[name=period]').dispatchEvent(new Event('change',{bubbles:true}))");
 await waitFor("Boolean(document.querySelector('input[name=endDate]'))");
 assert.equal(await evaluate("document.querySelector('input[name=endDate]').max"),shiftDay(today,-1));
 console.log('PASS ready facts, constraints, warnings and comparison visible');
 await evaluate("document.querySelector('.behavior-panel summary').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await waitFor("document.querySelector('details').open");
 assert.equal(await evaluate("document.querySelector('details tbody').rows.length"),30);
 assert.ok(await evaluate("document.querySelector('details tbody tr').textContent.includes('"+period.current.startDate+"')"));
 assert.ok(await evaluate("document.querySelector('details tbody tr').textContent.includes('"+period.previous.startDate+"')"));
 console.log('PASS keyboard table aligns ordinal index but displays distinct calendar dates');
 await evaluate("window.__mode='limited';window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelector('.behavior-page').textContent.includes('ยังเปรียบเทียบแบบแผนไม่ได้')");
 assert.equal(await evaluate("document.querySelectorAll('.behavior-change').length"),0);
 assert.ok(await evaluate("document.querySelector('.behavior-page').textContent.includes('500.00')"));
 assert.ok(await evaluate("document.querySelector('.behavior-page').textContent.includes('ไม่มีรายการที่บันทึก')"));
 console.log('PASS insufficient data keeps facts and hides all deltas and comparison findings');
 await evaluate("window.__mode='empty';window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelector('.behavior-page').textContent.includes('ไม่มีรายการรายจ่ายในทั้งสองช่วง')");
 assert.equal(await evaluate("document.querySelectorAll('.behavior-chart').length"),0);
 console.log('PASS empty has no invented graph');
 await evaluate("window.__mode='full';window.__fail=true;window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("Boolean(document.querySelector('.behavior-page [role=alert] button'))");
 await evaluate("document.querySelector('.behavior-page [role=alert] button').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await waitFor("document.querySelector('.behavior-change')!==null && !document.querySelector('.behavior-page [role=alert]')");
 console.log('PASS error/keyboard retry restores data');
 await evaluate("window.__hold=true;window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("window.__requests.at(-1).held");
 await evaluate("window.__hold=false;window.__mode='limited';document.querySelector('select[name=categoryId]').value='"+testCategoryId+"';document.querySelector('select[name=categoryId]').dispatchEvent(new Event('change',{bubbles:true}))");
 await evaluate("new Promise(r=>requestAnimationFrame(r))");
 assert.equal(await evaluate("document.querySelector('select[name=categoryId]').value"),testCategoryId);
 await evaluate("new Promise(r=>requestAnimationFrame(r))");
 await waitFor("location.search.includes('categoryId=') && window.__requests.at(-1).query.includes('categoryId=') && document.querySelector('.behavior-page').textContent.includes('ยังเปรียบเทียบแบบแผนไม่ได้')");
 await evaluate("window.__release()");await waitFor("window.__requests.every(r=>!r.held||r.consumed)");
 await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 assert.equal(await evaluate("document.querySelectorAll('.behavior-change').length"),0);
 assert.ok(await evaluate("window.__requests.filter(r=>r.held).every(r=>r.aborted)"));
 console.log('PASS category query filter and deferred old scope cannot overwrite new facts');
 await evaluate("window.__hold=true;window.dispatchEvent(new Event('spendsense-data-changed'))");await waitFor("window.__requests.at(-1).held");
 await evaluate("window.__hold=false;window.__mode='full';localStorage.setItem('spendsense_token','session-b');window.dispatchEvent(new Event('spendsense-session'))");
 await waitFor("document.querySelector('.behavior-report').textContent.includes('session-b')");
 await evaluate("window.__release()");await waitFor("window.__requests.every(r=>!r.held||r.consumed)");await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 assert.equal(await evaluate("document.querySelector('.behavior-report').textContent.includes('session-a')"),false);
 console.log('PASS old session cannot overwrite new account');

 await evaluate("window.__hold=true;window.dispatchEvent(new Event('spendsense-data-changed'))");await waitFor("window.__requests.at(-1).held");
 await evaluate("document.querySelector('select[name=period]').value='custom';document.querySelector('select[name=period]').dispatchEvent(new Event('change',{bubbles:true}))");
 await waitFor("Boolean(document.querySelector('input[name=startDate]'))");
 const nextStart=shiftDay(period.current.startDate,1);
 await evaluate("window.__hold=false;window.__mode='limited';const el=document.querySelector('input[name=startDate]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'"+nextStart+"');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))");
 await evaluate("new Promise(r=>requestAnimationFrame(r))");
 assert.equal(await evaluate("document.querySelector('input[name=startDate]').value"),nextStart);
 await waitFor("new URLSearchParams(location.search).get('startDate')==='"+nextStart+"' && window.__requests.at(-1).query.includes('"+nextStart+"') && document.querySelector('.behavior-page').textContent.includes('ยังเปรียบเทียบแบบแผนไม่ได้')");
 await evaluate("window.__release()");await waitFor("window.__requests.every(r=>!r.held||r.consumed)");await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
 assert.equal(await evaluate("document.querySelectorAll('.behavior-change').length"),0);
 assert.equal(await evaluate("document.querySelectorAll('.behavior-controls').length"),1);
 assert.equal(await evaluate("document.querySelectorAll('.behavior-report').length"),1);
 console.log('PASS automatic custom date/category filtering, single controls/report, old response cannot restore comparison');

 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),true);
 assert.ok(await evaluate("[...document.querySelectorAll('.behavior-table')].every(t=>t.scrollWidth>=t.clientWidth)"));
 console.log('PASS mobile long text/table containment');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();console.log('Behavior browser: API mocks only; Chrome profile outside repository.');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
