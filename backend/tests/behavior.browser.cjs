require('./browserGuard.cjs');
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const origin=process.env.SETTINGS_BROWSER_ORIGIN||'http://127.0.0.1:5177';
const {buildBehavior}=require('../dist/lib/behavior'),{behaviorPeriod,shiftDay}=require('../dist/lib/behaviorRules'),{bangkokToday}=require('../dist/lib/goalCalculations');
const today=bangkokToday(),period=behaviorPeriod({},today),testCategoryId='11111111-1111-4111-8111-111111111111';
const history=(start,count=30)=>Array.from({length:count},(_,i)=>({categoryId:testCategoryId,categoryName:'ชื่อหมวดยาว '.repeat(30),date:shiftDay(start,i),bucket:3,count:1,amount:'100.00',transactions:[{id:'synthetic-'+start+'-'+i,date:shiftDay(start,i),amount:'100.00',time:'12:00'}]}));
const options=[{categoryId:testCategoryId,categoryName:'ชื่อหมวดยาว '.repeat(30)},{categoryId:null,categoryName:'ไม่ระบุหมวด'}];
const base={asOfDate:today,period,rows:[...history(period.previous.startDate),...history(period.current.startDate)],categoryOptions:options,recurrences:[{categoryId:testCategoryId,categoryName:'หมวดทดสอบซ้ำ',amount:'100.00',dates:[0,7,14,21].map(n=>shiftDay(period.current.startDate,n)),counts:[1,1,1,1],kind:'weekly',transactions:[0,7,14,21].map(n=>({id:'repeat-'+n,date:shiftDay(period.current.startDate,n),amount:'100.00',time:null}))}]};
const payloads={full:buildBehavior(base),limited:buildBehavior({...base,rows:history(period.current.startDate,5)}),empty:buildBehavior({...base,rows:[]})};
const witness=(kind,offsets)=>({categoryId:testCategoryId,categoryName:'หมวดทดสอบซ้ำ',amount:'100.00',kind,dates:offsets.map(n=>shiftDay(period.current.startDate,n)),counts:offsets.map(()=>1),transactions:offsets.map(n=>({id:'repeat-'+n,date:shiftDay(period.current.startDate,n),amount:'100.00',time:null}))});
payloads.dedup=buildBehavior({...base,recurrences:[witness('general',[0,7,14,21,28]),witness('weekly',[0,7,14,21]),witness('general',[24,25,26,27,28])]});
payloads.noMatch=buildBehavior({...base,recurrences:[],rows:base.rows.map((r,i)=>({...r,bucket:i%6}))});
payloads.previousInsufficient=buildBehavior({...base,recurrences:[],rows:history(period.current.startDate)});
payloads.categoryInsufficient=buildBehavior({...base,recurrences:[],rows:[...base.rows,{categoryId:'minor',categoryName:'หมวดหลักฐานน้อย',date:period.current.startDate,bucket:-1,count:1,amount:'1',transactions:[]}]});
payloads.truncated={...payloads.noMatch,facts:{...payloads.noMatch.facts,recurrence:{...payloads.noMatch.facts.recurrence,hasMore:true}}};
const mock=(payloads)=>{
 localStorage.setItem('spendsense_token','session-a');window.__mode='full';window.__requests=[];window.__gates=[];window.__release=()=>window.__gates.splice(0).forEach(r=>r());
 const native=window.fetch.bind(window);window.fetch=async(url,options={})=>{
  const uri=new URL(String(url),location.origin);
  const isApi=uri.pathname.startsWith('/api/')||uri.origin==='http://localhost:4000';
  if(!isApi){if(uri.origin!==location.origin)throw Error('External fetch blocked by synthetic test');return native(url,options);}
  const route=uri.pathname.replace(/^\/api(?=\/)/,''),session=new Headers(options.headers).get('Authorization')?.replace('Bearer ','');
  let data={};
  if(route==='/auth/me')data={role:'USER',showSetup:false};
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
 assert.ok(await evaluate("document.querySelector('[aria-label=\"รูปแบบที่เกิดซ้ำ\"]').textContent.includes('4 ครั้ง')"));
 assert.ok(await evaluate("document.querySelector('.behavior-findings').textContent.includes('การเปลี่ยนแปลงเพียงอย่างเดียว')"));
 await evaluate("document.querySelector('[aria-label=\"รูปแบบที่เกิดซ้ำ\"] .behavior-evidence-details summary').click()");
 assert.ok(await evaluate("document.querySelector('[aria-label=\"รูปแบบที่เกิดซ้ำ\"] table').textContent.includes('repeat-0')"));
 assert.ok(await evaluate("document.querySelector('[aria-label=\"รูปแบบที่เกิดซ้ำ\"] table').textContent.includes('ไม่ยืนยัน/ไม่มีเวลา')"));
 console.log('PASS recurrence evidence is inspectable and separate from comparison, unconfirmed time hidden');
 assert.ok(await evaluate("Boolean(document.querySelector('.behavior-findings .behavior-recurrences'))"));
 assert.ok(await evaluate("document.querySelector('.behavior-recurrences').textContent.includes('พบล่าสุดในหลักฐานนี้')"));
 assert.ok(await evaluate("document.querySelector('.behavior-recurrences').textContent.includes('ไม่ใช่การยืนยันว่ารายการยังเกิดอยู่ในปัจจุบัน')"));
 assert.ok(await evaluate("Boolean(document.querySelector('.behavior-readiness'))"));
 await evaluate("Array.from(document.querySelectorAll('a')).find(a=>a.hash==='#behavior-recurrence-0').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 assert.equal(await evaluate("document.activeElement.id"),'behavior-recurrence-0');
 await evaluate("document.querySelector('.behavior-full-name summary').click()");
 assert.ok(await evaluate("document.querySelector('.behavior-full-name').open"));
 await evaluate("document.querySelector('.behavior-full-name summary').click()");
 console.log('PASS recurrence placement, historical wording, readiness, keyboard evidence and expandable category');

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
 await evaluate("window.__mode='dedup';window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelectorAll('.behavior-pattern-card').length===2");
 assert.deepEqual(await evaluate("[...document.querySelectorAll('.behavior-pattern-kind')].map(x=>x.textContent)"),['รายสัปดาห์','ทั่วไป']);
 assert.ok(await evaluate("document.querySelector('.behavior-recurrences').textContent.includes('5 ครั้ง')"));
 for(const text of ['ไม่เกิน','อย่างน้อย 5% และอย่างน้อย 100','ยอดเพิ่มน้อยกว่านี้','ส่วนยอดลดเป็นข้อมูลข้อเท็จจริง','÷ จำนวนรายจ่ายทั้งหมดในขอบเขต','ไม่ใช่การตัดสินความผิดปกติ'])assert.ok(await evaluate("document.querySelector('.behavior-shared-rules').textContent.includes("+JSON.stringify(text)+")"));
 console.log('PASS duplicate card removed, independent same-group evidence retained and confirmed tolerance explanations visible');
 await evaluate("window.__mode='noMatch';window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelector('.behavior-analysis-status').textContent.includes('ตรวจแล้วไม่พบการกระจุกตัว')");
 assert.ok(await evaluate("document.querySelector('.behavior-recurrences').textContent.includes('ตรวจแล้วไม่พบรูปแบบซ้ำ')"));
 assert.ok(await evaluate("document.querySelector('.behavior-analysis-status').textContent.includes('ตรวจแล้วไม่พบข้อค้นพบเปรียบเทียบยอดเพิ่ม')"));
 await evaluate("window.__mode='limited';window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelector('.behavior-recurrences').textContent.includes('ข้อมูลไม่พอสำหรับตรวจรูปแบบซ้ำ')");
 assert.ok(await evaluate("document.querySelector('.behavior-analysis-status').textContent.includes('ข้อมูลไม่พอสำหรับข้อสรุปเปรียบเทียบ')"));
 assert.ok(await evaluate("document.querySelector('.behavior-analysis-status').textContent.includes('ข้อมูลไม่พอสำหรับข้อสังเกตเวลา')"));
 assert.equal(await evaluate("document.querySelector('.behavior-findings').textContent.includes('ตรวจแล้วไม่พบ')"),false);
 await evaluate("window.__mode='previousInsufficient';window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelector('.behavior-recurrences').textContent.includes('ตรวจแล้วไม่พบรูปแบบซ้ำ')");
 assert.ok(await evaluate("document.querySelector('.behavior-analysis-status').textContent.includes('ข้อมูลไม่พอสำหรับข้อสรุปเปรียบเทียบ')"));
 await evaluate("window.__mode='categoryInsufficient';window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelector('.behavior-analysis-status').textContent.includes('หมวดหลักฐานน้อย: ข้อมูลไม่พอ')");
 assert.ok(await evaluate("document.querySelector('.behavior-method').textContent.includes('รายหมวดยังไม่ครบ 5 รายการใน 3 วันต่อช่วง')"));
 await evaluate("window.__mode='truncated';window.dispatchEvent(new Event('spendsense-data-changed'))");
 await waitFor("document.querySelector('.behavior-recurrences').textContent.includes('ไม่สามารถสรุปจากรายการที่จำกัดไว้')");
 assert.equal(await evaluate("document.querySelector('.behavior-recurrences').textContent.includes('ตรวจแล้วไม่พบรูปแบบซ้ำ')"),false);
 console.log('PASS inspected/no-match, insufficient period/category/time and truncated states stay distinct');
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
 await waitFor("document.querySelector('.behavior-report')?.textContent.includes('session-b')");
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

 await send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),true);
 console.log('PASS mobile 390/320 long text/table containment');
 await send('Browser.close').catch(()=>{});
 }finally{socket?.close();browser.kill();console.log('Behavior browser: API mocks only; Chrome profile outside repository.');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
